"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useAuth } from "@/contexts/auth-context";
import { CarrierLinkModal } from "@/components/carrier-link-modal";
import { AdvertisementModal } from "@/components/advertisement-modal";
import { FeaturedWorksModal } from "@/components/featured-brands-modal";
import { UploadedWorksTable } from "@/components/uploaded-works-table";
import { FeaturedWorksList } from "@/components/featured-brands-list";
import { getWorks } from "@/lib/storage-service";
import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { logVisit } from "@/utils/logVisit";


export default function AdminDashboard() {
	const { signOut } = useAuth();
	const [isCarrierModalOpen, setIsCarrierModalOpen] = useState<boolean>(false);
	const [isAdModalOpen, setIsAdModalOpen] = useState<boolean>(false);
	const [isBrandsModalOpen, setIsBrandsModalOpen] = useState<boolean>(false);
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [workCount, setWorkCount] = useState<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [visits, setVisits] = useState(0);
  const [countryList, setCountryList] = useState<{ name: string; count: number }[]>([]);
  const [last7days, setLast7days] = useState<{ date: string; count: number }[]>([]);
  

  useEffect(() => {
	logVisit().catch((err) => console.error("Failed to log visit:", err));
  }, []);
  

  useEffect(() => {
    const fetchTraffic = async () => {
      const res = await fetch("/api/traffic-summary");
      const data = await res.json();
      setVisits(data.total);
      setCountryList(data.countries || []);
      setLast7days(data.last7days || []);
    };

    fetchTraffic();
    const interval = setInterval(fetchTraffic, 5000);
    return () => clearInterval(interval);
  }, []);
  

	useEffect(() => {
		const fetchWorkCount = async () => {
			try {
				setIsLoading(true);
				const works = await getWorks();
				setWorkCount(works.length);
			} catch (error) {
				console.error("Error fetching work count:", error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchWorkCount();
	}, []);

	// This function will be passed to the UploadedWorksTable to sync the search query
	const handleSearchChange = (query: string) => {
		setSearchQuery(query);
	};

	return (
		<div className="min-h-screen text-white p-20 px-10 bg-[#151D48]">
			<div className="max-w-8xl mx-auto">
				{/* Header */}
				<div className="flex justify-between items-center mb-8">
					<div className="flex items-center">
						<Image
							src="/images/cds-logo.svg"
							alt="CDS Logo"
							width={80}
							height={30}
							className="mr-4"
						/>
					</div>
					<div className="flex items-center gap-4">
						<div className="relative">
							<input
								type="text"
								placeholder="Search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-10 pr-4 py-2 rounded-2xl bg-white text-black w-64 shadow-[0_0_10px_1px_rgba(255,255,255,0.8)]"
							/>
							<Search className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
						</div>
						<Button
							variant="ghost"
							onClick={signOut}
							className="text-gray-400 hover:text-white"
						>
							<LogOut className="h-4 w-4 mr-2" /> Logout
						</Button>
					</div>
				</div>

				{/* Dashboard Title */}
				<h1 className="text-4xl font-bold mb-6">Admin Dashboard</h1>

				{/* Stats Cards */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
					<Card className="bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] border-none rounded-lg p-6 h-40 w-auto">
						<div className="flex flex-col space-y-4 items-start">
							<div className="flex items-center">
								<Image
									src="/images/icon.svg"
									alt="CDS Logo"
									width={50}
									height={50}
									className="mr-4"
								/>
								<p className="text-lg text-[#425166]">Number Of Works</p>
							</div>
							<p className="text-4xl text-[#151D48] ml-2 font-bold">
								{isLoading ? "..." : workCount}
							</p>
						</div>
					</Card>

					<Card className="bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] border-none rounded-lg p-6 h-40 w-auto">
						<div className="flex flex-col space-y-4 items-start">
							<div className="flex items-center">
								<Image
									src="/images/icon.svg"
									alt="CDS Logo"
									width={50}
									height={50}
									className="mr-4"
								/>
								<p className="text-lg text-[#425166]">Categories</p>
							</div>
							<p className="text-4xl text-[#151D48] ml-2 font-bold">7</p>
						</div>
					</Card>

					<Card className="relative group bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] border-none rounded-lg p-6 h-40 w-auto overflow-visible">
            <div className="flex flex-col space-y-4 items-start">
              <div className="flex items-center">
                <Image
                  src="/images/icon.svg"
                  alt="Website Traffic"
                  width={50}
                  height={50}
                  className="mr-4"
                />
                <p className="text-lg text-[#425166]">Website Traffic</p>
              </div>
              <p className="text-4xl text-[#151D48] ml-2 font-bold">{visits}</p>
            </div>

            {/* Hover Overlay showing last 7 days count */}
            <div className="absolute z-50 left-7 -top-20 mt-2 w-64 font-semibold text-sm text-gray-700 rounded-md shadow-lg bg-white  opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300 p-4">
  {last7days.length > 0
    ? `Last 7 Days Visits: ${last7days.reduce((acc, day) => acc + day.count, 0)}`
    : "Loading..."}
</div>
          </Card>

					<Card className="relative group bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] border-none rounded-lg p-6 h-40 w-auto overflow-visible">
  <div className="flex flex-col space-y-4 items-start">
    <div className="flex items-center">
      <Image
        src="/images/countries.svg"
        alt="Countries"
        width={50}
        height={50}
        className="mr-4"
      />
      <p className="text-lg tracking-tight text-[#425166]">Countries Joined In</p>
    </div>
    <p className="text-4xl text-[#151D48] ml-2 font-bold">
      {countryList.length}+
    </p>
  </div>

  {/* Hover Overlay */}
  <div className="absolute z-50 left-7 -top-20 mt-2 w-64 rounded-md shadow-lg bg-white text-black opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300 p-4">
    <p className="font-semibold text-sm mb-2 text-gray-700">Traffic by Country</p>
    <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
      {countryList.map((c) => {
        const percentage = ((c.count / visits) * 100).toFixed(1);
        return (
          <li key={c.name} className="flex justify-between">
            <span className="text-gray-800">{c.name}</span>
            <span className="text-gray-500">{percentage}%</span>
          </li>
        );
      })}
    </ul>
  </div>
</Card>

				</div>

				{/* Action Buttons */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-gradient-to-r rounded-lg from-[#08129C] to-[#072056] py-3 px-4">
					<Link href="/admin/upload-works">
						<Button className="bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] text-[#2E0202] border-none text-xl h-20 w-full">
							Upload Works
						</Button>
					</Link>
					<Button
						className="bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] text-[#2E0202] border-none h-20 text-xl"
						onClick={() => setIsBrandsModalOpen(true)}
					>
						Feature Brands
					</Button>
					<Button
						className="bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] text-[#2E0202] border-none h-20 text-xl"
						onClick={() => setIsAdModalOpen(true)}
					>
						Manage Advertisement
					</Button>
					<Button
						className="bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] text-[#2E0202] border-none h-20 text-xl"
						onClick={() => setIsCarrierModalOpen(true)}
					>
						Career Link
					</Button>
				</div>

				{/* Content Area */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gradient-to-r rounded-lg from-[#08129C] to-[#072056] py-3 px-4">
					{/* Uploaded Works Table */}
					<div className="md:col-span-2">
						<UploadedWorksTable
							searchQuery={searchQuery}
							onSearchChange={handleSearchChange}
						/>
					</div>

					{/* Featured Brands */}
					<div>
						<FeaturedWorksList />
					</div>
				</div>
			</div>

			{/* Modals */}
			<CarrierLinkModal
				isOpen={isCarrierModalOpen}
				onClose={() => setIsCarrierModalOpen(false)}
			/>
			<AdvertisementModal
				isOpen={isAdModalOpen}
				onClose={() => setIsAdModalOpen(false)}
			/>
			<FeaturedWorksModal
				isOpen={isBrandsModalOpen}
				onClose={() => setIsBrandsModalOpen(false)}
			/>
		</div>
	);
}
