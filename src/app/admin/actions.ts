"use server";

import { revalidatePath } from "next/cache";
import { createChapterFromFormData, createSeriesFromFormData } from "@/lib/admin";

export async function createSeriesAction(formData: FormData) {
  await createSeriesFromFormData(formData);
  revalidatePath("/");
  revalidatePath("/series");
  revalidatePath("/admin");
}

export async function createChapterAction(formData: FormData) {
  const seriesSlug = String(formData.get("seriesSlug") ?? "");
  await createChapterFromFormData(formData);
  revalidatePath("/");
  revalidatePath("/series");
  revalidatePath("/admin");
  revalidatePath(`/series/${seriesSlug}`);
}
