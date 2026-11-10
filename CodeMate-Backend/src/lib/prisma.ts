import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type Db = PrismaClient;

export function createPrisma(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
