/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	uploadFile,
	deleteFile,
	getAdvertisements,
	addAdvertisement,
	deleteAdvertisement,
	updateAdvertisement,
	type Advertisement,
} from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Trash2, Pencil, X, Save } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

interface AdvertisementModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function AdvertisementModal({
	isOpen,
	onClose,
}: AdvertisementModalProps) {
	const [ads, setAds] = useState<Advertisement[]>([]);
	const [link, setLink] = useState<string>("");
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [activeTab, setActiveTab] = useState<string>("add");
	const [editId, setEditId] = useState<string | null>(null);
	const [editLink, setEditLink] = useState<string>("");
	const [editFile, setEditFile] = useState<File | null>(null);
	const [editPreview, setEditPreview] = useState<string | null>(null);
	const { toast } = useToast();

	useEffect(() => {
		if (isOpen) fetchAds();
	}, [isOpen]);

	useEffect(() => {
		if (!file) {
			setPreview(null);
			return;
		}
		const objectUrl = URL.createObjectURL(file);
		setPreview(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [file]);

	const fetchAds = async () => {
		try {
			const data = await getAdvertisements();
			setAds(data || []);
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to load advertisements.",
				variant: "destructive",
			});
		}
	};

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files || e.target.files.length === 0) {
			setFile(null);
			return;
		}
		setFile(e.target.files[0]);
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (ads.length >= 10) {
			toast({
				title: "Limit Reached",
				description: "Only 10 advertisements allowed at a time.",
				variant: "destructive",
			});
			return;
		}
		if (!file || !link.trim()) {
			toast({
				title: "Missing Fields",
				description: "Upload an image and provide a valid link.",
				variant: "destructive",
			});
			return;
		}

		try {
			setIsLoading(true);
			const imageUrl = await uploadFile(file, "advertisements");
			await addAdvertisement({ imageUrl, link });
			toast({ title: "Success", description: "Advertisement added." });
			setFile(null);
			setLink("");
			setPreview(null);
			setActiveTab("manage");
			fetchAds();
		} catch (error) {
			toast({
				title: "Upload Failed",
				description: "Unable to upload the ad.",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const startEdit = (ad: Advertisement) => {
		setEditId(ad.id);
		setEditLink(ad.link);
		setEditFile(null);
		setEditPreview(ad.imageUrl);
	};

	const cancelEdit = () => {
		setEditId(null);
		setEditLink("");
		setEditFile(null);
		setEditPreview(null);
	};

	const handleEditFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const f = e.target.files?.[0] || null;
		setEditFile(f);
		if (f) setEditPreview(URL.createObjectURL(f));
	};

	const handleSaveEdit = async (oldImageUrl: string) => {
		if (!editId || !editLink.trim()) {
			toast({ title: "Missing link", description: "Provide a valid link.", variant: "destructive" });
			return;
		}
		setIsLoading(true);
		try {
			let newImageUrl: string | undefined;
			if (editFile) {
				newImageUrl = await uploadFile(editFile, "advertisements");
			}
			await updateAdvertisement(editId, {
				link: editLink.trim(),
				imageUrl: newImageUrl,
				oldImageUrl: newImageUrl ? oldImageUrl : undefined,
			});
			toast({ title: "Updated", description: "Advertisement updated." });
			cancelEdit();
			fetchAds();
		} catch (error) {
			toast({ title: "Update failed", description: "Could not update ad.", variant: "destructive" });
		} finally {
			setIsLoading(false);
		}
	};

	const handleDelete = async (id: string, imageUrl: string) => {
		try {
			setIsLoading(true);
			await deleteFile(imageUrl);
			await deleteAdvertisement(id);
			toast({ title: "Deleted", description: "Advertisement removed." });
			fetchAds();
		} catch (error) {
			toast({
				title: "Delete Failed",
				description: "Could not delete advertisement.",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="bg-white text-[#151D48] max-w-xl ">
				<DialogHeader>
					<DialogTitle>Manage Advertisements</DialogTitle>
				</DialogHeader>

				<Tabs value={activeTab} onValueChange={setActiveTab} className="pt-4">
					<TabsList className="grid w-full grid-cols-2 bg-[#D9D9D9]">
						<TabsTrigger value="add">Add Advertisement</TabsTrigger>
						<TabsTrigger value="manage">Manage Ads</TabsTrigger>
					</TabsList>

					<TabsContent value="add">
						<form onSubmit={handleSubmit} className="space-y-6 pt-4 pb-5">
							<div>
								<Label htmlFor="image" className="mb-2">Upload Image</Label>
								{preview ? (
									<div className="relative w-full h-60 rounded-md overflow-hidden bg-[#D9D9D9] cursor-pointer">
										<input
											type="file"
											accept="image/*"
											onChange={handleFileChange}
											className="absolute inset-0 opacity-0 cursor-pointer z-10"
										/>
										<Image
											src={preview}
											alt="Preview"
											fill
											className="object-contain"
										/>
									</div>
								) : (
									<label className="bg-[#D9D9D9] h-60 w-full flex items-center justify-center rounded cursor-pointer text-gray-500">
										<span>Click to upload image</span>
										<input
											type="file"
											accept="image/*"
											onChange={handleFileChange}
											className="hidden"
										/>
									</label>
								)}
							</div>

							<div>
								<Label htmlFor="link" className="mb-2">Add Link</Label>
								<Input
									id="link"
									value={link}
									onChange={(e) => setLink(e.target.value)}
									placeholder="https://example.com"
									className="bg-[#D9D9D9]"
								/>
							</div>

							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={onClose}
									className="bg-transparent border-[#072056] hover:bg-blue-50 cursor-pointer"
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={isLoading || ads.length >= 10}
									className="bg-gradient-to-r from-[#08129C] to-[#072056] text-white hover:scale-105 cursor-pointer"
								>
									{isLoading ? "Adding..." : "Add Advertisement"}
								</Button>
							</DialogFooter>
						</form>
					</TabsContent>

					<TabsContent value="manage" className="pt-4 max-h-[60vh] overflow-y-auto">
						{ads.length === 0 ? (
							<p className="text-sm text-gray-500">No ads uploaded yet.</p>
						) : (
							ads.map((ad) => {
								const isEditing = editId === ad.id;
								return (
									<div key={ad.id} className="p-3 bg-[#D9D9D9] rounded-md mb-4">
										{isEditing ? (
											<>
												<div className="relative w-full h-60 rounded-md overflow-hidden mb-2 bg-[#D9D9D9]">
													{editPreview && (
														<Image src={editPreview} alt="Edit preview" fill className="object-contain" />
													)}
													<input
														type="file"
														accept="image/*"
														onChange={handleEditFileChange}
														className="absolute inset-0 opacity-0 cursor-pointer z-10"
													/>
												</div>
												<Label className="text-xs">Replace image</Label>
												<p className="text-[11px] text-gray-600 mb-2">Click the preview above to choose a new image</p>
												<Label htmlFor={`edit-link-${ad.id}`} className="text-xs">Link</Label>
												<Input
													id={`edit-link-${ad.id}`}
													value={editLink}
													onChange={(e) => setEditLink(e.target.value)}
													placeholder="https://example.com"
													className="bg-white mt-1"
												/>
												<div className="flex gap-2 mt-3">
													<Button
														type="button"
														size="sm"
														onClick={() => handleSaveEdit(ad.imageUrl)}
														disabled={isLoading}
														className="bg-gradient-to-r from-[#08129C] to-[#072056] text-white"
													>
														<Save className="h-4 w-4 mr-1" /> {isLoading ? "Saving..." : "Save"}
													</Button>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={cancelEdit}
														disabled={isLoading}
													>
														<X className="h-4 w-4 mr-1" /> Cancel
													</Button>
												</div>
											</>
										) : (
											<>
												<div className="relative w-full h-60 rounded-md overflow-hidden mb-2">
													<Image src={ad.imageUrl} alt="Ad" fill className="object-contain" />
												</div>
												<p className="text-sm truncate">Link: {ad.link}</p>
												<p className="text-xs text-gray-500 mt-1">
													Uploaded: {new Date(ad.createdAt).toLocaleString()}
												</p>
												<div className="flex gap-2 mt-2">
													<Button
														type="button"
														size="sm"
														onClick={() => startEdit(ad)}
														disabled={isLoading}
														className="bg-[#072056] text-white hover:bg-[#08129C]"
													>
														<Pencil className="h-4 w-4 mr-1" /> Edit
													</Button>
													<Button
														type="button"
														variant="destructive"
														size="sm"
														onClick={() => handleDelete(ad.id, ad.imageUrl)}
														disabled={isLoading}
														className="text-[#072056]"
													>
														<Trash2 className="h-4 w-4 mr-1" /> Delete
													</Button>
												</div>
											</>
										)}
									</div>
								);
							})
						)}
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
