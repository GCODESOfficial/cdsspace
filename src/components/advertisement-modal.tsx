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
	type Advertisement,
} from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Trash2 } from "lucide-react";
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

		if (ads.length >= 3) {
			toast({
				title: "Limit Reached",
				description: "Only 3 advertisements allowed at a time.",
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
			<DialogContent className="bg-white text-[#151D48] max-w-xl">
				<DialogHeader>
					<DialogTitle>Manage Advertisements</DialogTitle>
				</DialogHeader>

				<Tabs value={activeTab} onValueChange={setActiveTab} className="pt-2">
					<TabsList className="grid w-full grid-cols-2 bg-[#D9D9D9]">
						<TabsTrigger value="add">Add Advertisement</TabsTrigger>
						<TabsTrigger value="manage">Manage Ads</TabsTrigger>
					</TabsList>

					<TabsContent value="add">
						<form onSubmit={handleSubmit} className="space-y-4 pt-4">
							<div>
								<Label htmlFor="image">Upload Image</Label>
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
								<Label htmlFor="link">Add Link</Label>
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
									className="bg-transparent border-[#072056]"
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={isLoading || ads.length >= 3}
									className="bg-gradient-to-r from-[#08129C] to-[#072056] text-white"
								>
									{isLoading ? "Adding..." : "Add Advertisement"}
								</Button>
							</DialogFooter>
						</form>
					</TabsContent>

					<TabsContent value="manage" className="pt-4">
						{ads.length === 0 ? (
							<p className="text-sm text-gray-500">No ads uploaded yet.</p>
						) : (
							ads.map((ad) => (
								<div key={ad.id} className="p-3 bg-[#D9D9D9] rounded-md mb-4">
									<div className="relative w-full h-60 rounded-md overflow-hidden mb-2">
										<Image
											src={ad.imageUrl}
											alt="Ad"
											fill
											className="object-contain"
										/>
									</div>
									<p className="text-sm truncate">Link: {ad.link}</p>
									<p className="text-xs text-gray-500 mt-1">
										Uploaded: {new Date(ad.createdAt).toLocaleString()}
									</p>
									<Button
										type="button"
										variant="destructive"
										size="sm"
										onClick={() => handleDelete(ad.id, ad.imageUrl)}
										disabled={isLoading}
										className="mt-2 text-[#072056]"
									>
										<Trash2 className="h-4 w-4 mr-1" /> Delete
									</Button>
								</div>
							))
						)}
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
