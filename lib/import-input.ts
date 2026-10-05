import { z } from "zod";
import { dateSchema } from "./budget.ts";
import { RequestError } from "./request.ts";

export const MAX_AI_TEXT = 20_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const AUDIO_EXTENSIONS = ["webm", "m4a", "mp4", "mp3", "wav", "ogg"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
export const FILE_EXTENSIONS = [
  "pdf",
  "xlsx",
  "xls",
  "csv",
  ...IMAGE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
];
export const FILE_ACCEPT = FILE_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");
export const extension = (name: string) =>
  name.split(".").pop()?.toLowerCase() || "";
export function fileError(file: Pick<File, "size" | "name">) {
  if (file.size > MAX_FILE_BYTES) return "Максимальный размер файла — 10 МБ.";
  if (!FILE_EXTENSIONS.includes(extension(file.name)))
    return "Поддерживаются PDF, Excel, CSV, JPG, PNG, WebP, WebM, M4A, MP4, MP3, WAV и OGG.";
  if (!file.size) return "Файл пуст.";
  return "";
}
const categoriesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      name: z.string().min(1).max(50),
    }),
  )
  .min(1)
  .max(50);
export function parseImportForm(form: FormData) {
  const text = form.get("text") ?? "",
    categories = form.get("categories"),
    date = form.get("date"),
    file = form.get("file");
  if (typeof text !== "string" || text.length > MAX_AI_TEXT)
    throw new RequestError("Текст — максимум 20 000 символов.", 400);
  if (
    !dateSchema.safeParse(date).success ||
    typeof categories !== "string" ||
    categories.length > 12_000
  )
    throw new RequestError("Проверьте дату и категории.", 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(categories);
  } catch {
    throw new RequestError("Некорректные категории.", 400);
  }
  if (!categoriesSchema.safeParse(parsed).success)
    throw new RequestError("Некорректные категории.", 400);
  if (file !== null && !(file instanceof File))
    throw new RequestError("Некорректный файл.", 400);
  if (file instanceof File && fileError(file))
    throw new RequestError(
      fileError(file),
      file.size > MAX_FILE_BYTES ? 413 : 400,
    );
  if (!text.trim() && !file)
    throw new RequestError("Напишите расход или выберите файл.", 400);
  return { text, categories, date: date as string, file: file as File | null };
}
