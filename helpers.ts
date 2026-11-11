import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export function go(path: string, msg?: string, type: "ok" | "err" = "ok"): never {
  revalidatePath("/dashboard", "layout");
  const url = msg ? `${path}${path.includes("?") ? "&" : "?"}${type === "err" ? "err" : "msg"}=${encodeURIComponent(msg)}` : path;
  redirect(url);
}

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const num = (fd: FormData, key: string) => Number(fd.get(key) ?? 0);
export const opt = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return v.length ? v : null;
};
