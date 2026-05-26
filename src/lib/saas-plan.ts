import { PlanCode } from "@prisma/client";

export type PlanLimits = {
  planCode: PlanCode;
  seatLimit: number;
  aiMonthlyLimit: number;
};

export type PlanCatalogItem = {
  planCode: PlanCode;
  name: string;
  seatLimit: number;
  aiMonthlyLimit: number;
  features: string[];
};

export const PLAN_CATALOG: PlanCatalogItem[] = [
  {
    planCode: PlanCode.STARTER,
    name: "Starter",
    seatLimit: 200,
    aiMonthlyLimit: 2000,
    features: [
      "Canal de denúncias + tracking por token",
      "Trilha de auditoria imutável",
      "Gestão colaborativa do conselho",
    ],
  },
  {
    planCode: PlanCode.BUSINESS,
    name: "Business",
    seatLimit: 1000,
    aiMonthlyLimit: 10000,
    features: [
      "Tudo do Starter",
      "Maior capacidade de usuários e IA",
      "Operação multi-time de investigação",
    ],
  },
  {
    planCode: PlanCode.ENTERPRISE,
    name: "Enterprise",
    seatLimit: 10000,
    aiMonthlyLimit: 50000,
    features: [
      "Tudo do Business",
      "Alta escala para grupos corporativos",
      "Capacidade ampliada para demandas regulatórias",
    ],
  },
];

export function suggestPlanByEmployees(estimatedEmployees: number): PlanLimits {
  if (estimatedEmployees > 1000) {
    return {
      planCode: PlanCode.ENTERPRISE,
      seatLimit: 10000,
      aiMonthlyLimit: 50000,
    };
  }

  if (estimatedEmployees > 200) {
    return {
      planCode: PlanCode.BUSINESS,
      seatLimit: 1000,
      aiMonthlyLimit: 10000,
    };
  }

  return {
    planCode: PlanCode.STARTER,
    seatLimit: 200,
    aiMonthlyLimit: 2000,
  };
}

export function planDescription(planCode: PlanCode) {
  if (planCode === PlanCode.ENTERPRISE) return "Enterprise";
  if (planCode === PlanCode.BUSINESS) return "Business";
  return "Starter";
}

export function getPlanByCode(planCode: PlanCode) {
  return PLAN_CATALOG.find((plan) => plan.planCode === planCode) ?? PLAN_CATALOG[0];
}
