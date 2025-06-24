"use server";

import { optimize } from "svgo";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./supabase";

export async function uploadFile(file: File, folder: string): Promise<string> {
	const extension = file.name.split(".").pop()?.toLowerCase();
	let fileToUpload = file;

	if (extension === "svg") {
		const text = await file.text();
		const result = optimize(text, {
			multipass: true,
		});

		if ("data" in result) {
			fileToUpload = new File([result.data], file.name, {
				type: "image/svg+xml",
			});
		}
	}

	const filePath = `${folder}/${uuidv4()}.${extension}`;
	const { error } = await supabase.storage.from("media").upload(filePath, fileToUpload);

	if (error) {
		throw new Error(`Failed to upload file: ${error.message}`);
	}

	const publicUrl = supabase.storage.from("media").getPublicUrl(filePath);
	return publicUrl.data.publicUrl;
}