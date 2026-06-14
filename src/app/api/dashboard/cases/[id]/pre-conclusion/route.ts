import { DisclosureLevel, PipelineAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { enqueueOutboxAction } from "@/lib/intake/outbox";
import { processCaseOutboxSafely } from "@/lib/intake/processor";
import { decryptSensitiveText } from "@/lib/secure-data";
import { createImmutableAuditEvent } from "@/lib/audit";
import { loadCommitteeCaseContext } from "@/lib/committee-recipients";
import { sendCommitteeVoteRequiredNotification } from "@/lib/notifications";

type PublishBody = {
  publishToCommittee?: boolean;
  disclosureMode?: "ROLE_ONLY" | "PSEUDONYM" | "FULL_NAME";
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "case.read");
  if (!allowed.ok) return allowed.response;

  const { id } = await context.params;
  const externalId = `CASO-${id.toUpperCase()}`;
  const reportCase = await prisma.case.findFirst({
    where: {
      tenantId: allowed.user.tenantId,
      externalId,
    },
    select: {
      id: true,
      externalId: true,
      status: true,
      reviewConcludedAt: true,
      readyForCommitteeAt: true,
      preConclusionPackage: true,
      implicatedPeople: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          source: true,
          roleHint: true,
          disclosureLevel: true,
          displayNameEncrypted: true,
          disclosedAt: true,
          disclosedByUserId: true,
        },
      },
    },
  });
  if (!reportCase) {
    return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
  }

  const implicated = reportCase.implicatedPeople.map((person) => {
    const decryptedName = decryptSensitiveText(person.displayNameEncrypted);
    const visibleName =
      person.disclosureLevel === DisclosureLevel.FULL_NAME
        ? decryptedName
        : person.disclosureLevel === DisclosureLevel.PSEUDONYM
          ? `Pessoa-${person.id.slice(0, 6).toUpperCase()}`
          : "Identidade protegida";
    return {
      id: person.id,
      source: person.source,
      roleHint: person.roleHint,
      disclosureLevel: person.disclosureLevel,
      visibleName,
      disclosedAt: person.disclosedAt?.toISOString() ?? null,
      disclosedByUserId: person.disclosedByUserId,
    };
  });

  return NextResponse.json({
    ok: true,
    preConclusion: {
      caseExternalId: reportCase.externalId,
      status: reportCase.status,
      reviewConcludedAt: reportCase.reviewConcludedAt?.toISOString() ?? null,
      readyForCommitteeAt: reportCase.readyForCommitteeAt?.toISOString() ?? null,
      package: reportCase.preConclusionPackage,
      implicated,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "case.investigate");
  if (!allowed.ok) return allowed.response;

  let body: PublishBody;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { id } = await context.params;
  const externalId = `CASO-${id.toUpperCase()}`;
  const reportCase = await prisma.case.findFirst({
    where: {
      tenantId: allowed.user.tenantId,
      externalId,
    },
    select: {
      id: true,
      status: true,
      reviewConcludedAt: true,
      restrictedUserIds: true,
    },
  });
  if (!reportCase) {
    return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
  }
  if (reportCase.restrictedUserIds.includes(allowed.user.id)) {
    return NextResponse.json({ error: "Acesso bloqueado por conflito de interesse." }, { status: 403 });
  }
  if (!reportCase.reviewConcludedAt) {
    return NextResponse.json(
      { error: "Revisão iterativa ainda não concluída. Não é possível publicar pre-conclusão." },
      { status: 400 },
    );
  }

  const disclosureLevel = (() => {
    if (body.disclosureMode === "FULL_NAME") return DisclosureLevel.FULL_NAME;
    if (body.disclosureMode === "PSEUDONYM") return DisclosureLevel.PSEUDONYM;
    return DisclosureLevel.ROLE_ONLY;
  })();

  await prisma.$transaction(async (tx) => {
    await tx.caseImplicatedPerson.updateMany({
      where: {
        tenantId: allowed.user.tenantId,
        caseId: reportCase.id,
      },
      data: {
        disclosureLevel,
        disclosedAt: new Date(),
        disclosedByUserId: allowed.user.id,
      },
    });

    await enqueueOutboxAction(tx, {
      tenantId: allowed.user.tenantId,
      caseId: reportCase.id,
      action: PipelineAction.PREPARE_PRE_CONCLUSION,
      payload: {
        actorUserId: allowed.user.id,
        disclosureLevel,
      },
      idempotencyKey: `${reportCase.id}:pre-conclusion:${Date.now()}`,
    });
  });

  await processCaseOutboxSafely({
    tenantId: allowed.user.tenantId,
    caseId: reportCase.id,
  });

  const publishToCommittee = body.publishToCommittee !== false;
  if (publishToCommittee) {
    await prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: reportCase.id },
        data: {
          status: "AWAITING_COMMITTEE_APPROVAL",
          committeeDecisionStartedAt: new Date(),
        },
      });
      await createImmutableAuditEvent(tx, {
        tenantId: allowed.user.tenantId,
        caseId: reportCase.id,
        actorUserId: allowed.user.id,
        action: "CASE_PRE_CONCLUSION_PUBLISHED_TO_COMMITTEE",
        payload: {
          disclosureLevel,
        },
      });
    });

    const committee = await loadCommitteeCaseContext(allowed.user.tenantId, reportCase.id);
    if (committee) {
      void sendCommitteeVoteRequiredNotification({
        ...committee,
        origin: "investigation-publish",
      }).catch(() => {});
    }
  }

  const updated = await prisma.case.findUnique({
    where: { id: reportCase.id },
    select: {
      externalId: true,
      status: true,
      preConclusionPackage: true,
      readyForCommitteeAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    case: updated,
  });
}

