/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	getCarrierLink,
	updateCarrierLink,
	type CarrierLink,
} from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";

interface CarrierLinkModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function CarrierLinkModal({ isOpen, onClose }: CarrierLinkModalProps) {
	const [url, setUrl] = useState<string>("");
	const [currentLink, setCurrentLink] = useState<CarrierLink | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const { toast } = useToast();

	useEffect(() => {
		if (isOpen) {
			const fetchLink = async () => {
				const link = await getCarrierLink();
				setCurrentLink(link);
				if (link) {
					setUrl(link.url);
				}
			};
	
			fetchLink();
		}
	}, [isOpen]);
	

	const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!url.trim()) {
			toast({
				title: "Error",
				description: "Please enter a valid URL",
				variant: "destructive",
			});
			return;
		}

		try {
			setIsLoading(true);
			updateCarrierLink(url);
			toast({
				title: "Success",
				description: "Carrier link updated successfully",
			});
			onClose();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to update carrier link",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
		setUrl(e.target.value);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="bg-white text-[#151D48]">
				<DialogHeader>
					<DialogTitle>Update Carrier Link</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4 pt-2">
					{currentLink && (
						<div className="p-3 bg-white rounded-md">
							<p className="text-sm text-gray-400">Current Link:</p>
							<p className="text-sm truncate">{currentLink.url}</p>
							<p className="text-xs text-gray-500 mt-1">
								Last updated: {new Date(currentLink.createdAt).toLocaleString()}
							</p>
						</div>
					)}

					<Input
						id="url"
						value={url}
						onChange={handleUrlChange}
						placeholder="https://example.com"
						className="bg-[#D9D9D9] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none"
					/>

					<DialogFooter className="pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							className="bg-transparent rounded-lg border-[#072056] hover:text-white hover:bg-[#08129C]"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isLoading}
							className="bg-gradient-to-r from-[#08129C] to-[#072056] text-white rounded-lg hover:shadow-[0_0_15px_4px_rgba(255,255,255,0.3)] transition-shadow duration-300"
						>
							{isLoading ? "Updating..." : "Update Link"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
