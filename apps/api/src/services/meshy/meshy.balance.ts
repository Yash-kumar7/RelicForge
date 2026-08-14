import { meshyJson } from "./meshy.client.js";
import { BalanceSchema } from "./meshy.types.js";

export async function getBalance(): Promise<number> {
  const raw = await meshyJson<unknown>("/v1/balance", { method: "GET" });
  return BalanceSchema.parse(raw).balance;
}
