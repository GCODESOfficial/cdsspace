"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AOS from "aos";
import "aos/dist/aos.css";
import Image from "next/image";

export default function Footer() {
	useEffect(() => {
    AOS.init({ duration: 800, once: true });
    AOS.refresh(); // <- forces recalculation
  }, []);


  const [email, setEmail] = useState('');

  const handleSubmit = (e: { preventDefault: () => void; }) => {
    e.preventDefault();

    if (email) {
      // Redirect to Linktree with the email as a query parameter
      const subscribeUrl = `https://linktr.ee/cdsspace?subscribe&email=${encodeURIComponent(email)}`;
      window.location.href = subscribeUrl;
    }
  };

	return (
		<footer className="bg-[#020839] text-white py-20 relative">
			<div className="md:max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 md:gap-80 gap-20 max-w-[90%]">
				{/* Logo and Subscription */}
				<div data-aos="fade-up">
					<div className="mb-4">
						<div className="flex items-center">
						<Link href="/Home">
							<Image
								src="/images/cds-logo.svg"
								alt="CDS Logo"
								width={80}
								height={30}
							/>
							</Link>
						</div>
					</div>

          <div className="md:pt-24 pt-14">
					<p className="font-semibold mb-2">Stay in touch</p>
					<p className="text-xs mb-3 ">
						Join our mailing list to stay in touch with our newest feature
						releases, and tips about branding
					</p>
					<form className="flex flex-col gap-2" onSubmit={handleSubmit}>
						<input
							type="email"
							placeholder="Email Address"
							className="bg-transparent border-b border-gray-400 text-sm py-1 focus:outline-none placeholder-gray-400"
							data-aos="fade-right"
							onChange={(e) => setEmail(e.target.value)}
							value={email}
						/>
						<button
							type="submit"
							className="bg-white text-[#020839] text-sm font-semibold py-1 px-4 w-fit rounded"
							data-aos="fade-left"
						>
							Subscribe
						</button>
					</form>
          </div>
				</div>
				<div>
					{/* Contact Info */}
					<div data-aos="fade-up" data-aos-delay="100">
						<p className="text-white font-semibold mb-2">
							We collaborate with forward thinking brands and people, let’s
							talk.
						</p>
						<p className="text-sm mb-1">contact.cdsspace@gmail.com</p>
						<p className="text-sm">+234-81-028-27049</p>
					</div>

					{/* Social + Initiatives */}
					<div className="md:flex grid grid-cols-2 pt-10 md:gap-10" data-aos="fade-up" data-aos-delay="300">
						{/* Menu Links */}
						<div className="text-left">
							<p className="text-white font-semibold mb-2">MENU</p>
							<ul className="space-y-1 text-sm">
								<li>
									<Link href="/Works">Work</Link>
								</li>
								<li>
									<Link href="/About">About</Link>
								</li>
								<li>
									<Link href="/Career">Career</Link>
								</li>
								<li>
									<Link href="/Contact">Contact</Link>
								</li>
							</ul>
						</div>

						<div className="text-left">
							<p className="text-white font-semibold mb-2">SOCIALS</p>
							<ul className="space-y-1 text-sm">
								<li>
									<Link href="https://www.instagram.com/cdsspace">Instagram</Link>
								</li>
								<li>
									<Link href="https://web.facebook.com/cdsspace">Facebook</Link>
								</li>
								<li>
									<Link href="https://www.pinterest.com/cdsspace_/">Pinterest</Link>
								</li>
								<li>
									<Link href="https://linktr.ee/cdsspace">Linktree</Link>
								</li>
								<li>
									<Link href="https://twitter.com/cdsspace_">X</Link>
								</li>
								<li>
									<Link href="https://linktr.ee/cdsspace">LinkedIn</Link>
								</li>
							</ul>
						</div>

						<div className="text-left ">
							<p className="text-white font-semibold mb-2">Initiatives</p>
							<ul className="space-y-1 text-sm">
								<li>
									<Link href="#">Prime Nuptials</Link>
								</li>
								<li>
									<Link href="#">CDS Space Creative Network (CSCN)</Link>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</div>

			{/* Footer Bottom */}
			<div className="mt-10 border-t border-gray-700 w-full">
  <div className="max-w-5xl mx-auto pt-4 text-sm flex flex-col md:flex-row justify-between items-center">
  <p className="absolute bottom-4 md:bottom-0 md:relative">© {new Date().getFullYear()} CDS Space | Branding Agency.</p>
    <div className="flex md:gap-4 gap-32 mt-2 md:mt-0 ">
      <Link href="#">Privacy Policy</Link>
      <Link href="#">Terms of Service</Link>
    </div>
  </div>
</div>

		</footer>
	);
}
