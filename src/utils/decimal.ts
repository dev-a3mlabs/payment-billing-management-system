// Prisma returns DECIMAL columns as Decimal objects; the API sends plain numbers.
export const decimalToNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;
