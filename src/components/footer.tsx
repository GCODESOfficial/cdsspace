"use client";

import Link from "next/link";
import { useState } from "react";
import Image from "next/image";

export default function Footer() {
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
    <footer className="bg-[#020839] text-white md:py-20 pt-20 pb-3 relative">
      <div className="md:w-full mx-auto grid grid-cols-1 md:flex md:gap-0 md:justify-between md:px-9 px-7 gap-20">
        {/* Logo and Subscription */}
        <div>
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
            <p className="text-xs mb-3 md:w-xs">
              Join our mailing list to stay in touch with our newest feature
              releases, and tips about branding
            </p>
            <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="Email Address"
                className="bg-transparent border-b border-gray-400 text-sm py-1 focus:outline-none placeholder-gray-400"
                onChange={(e) => setEmail(e.target.value)}
                value={email}
              />
              <button
                type="submit"
                className="bg-white text-[#020839] text-sm font-semibold py-1 px-4 w-fit rounded"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
        <div className="">
          {/* Contact Info */}
          <div>
            <p className="text-white font-semibold mb-2 md:w-xs">
              We collaborate with forward thinking brands and people, let’s
              talk.
            </p>
            <a href="mailto:contact.cdsspace@gmail.com">
              <p className="text-sm mb-1">contact.cdsspace@gmail.com</p>
            </a>
            <p className="text-sm ">+234-81-028-27049</p>
          </div>

          {/* Social + Initiatives */}
          <div className="md:flex grid md:grid-cols-2 pt-10 gap-7 md:gap-20">
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
                <li>
									<Link href="/Links">Links</Link>
								</li>
								<li>
									<Link href="/logofolio">Logofolio</Link>
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
									<Link href="https://twitter.com/cdsspace_">X</Link>
								</li>
								<li>
									<Link href="https://linktr.ee/cdsspace">LinkedIn</Link>
								</li>
								<li>
									<Link href="https://www.youtube.com/@cdsspacelive">Youtube</Link>
								</li>
								<li>
									<Link href="https://www.tiktok.com/@cdsspace_">TikTok</Link>
								</li>
								<li>
									<Link href="https://wa.me/message/V7K4SBQW7METG1">WhatsApp</Link>
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
                  <Link href="#">CDS Space Campus Network</Link>
                </li>
                <li>
									<Link href="#">CSCN</Link>
								</li>                
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className="mt-10 border-t border-gray-700 w-full px-1 hidden md:block">
        <div className=" mx-auto pt-4 md:text-sm text-xs flex flex-col md:flex-row justify-between items-center px-9">
          <p className="absolute bottom-4 md:bottom-0 md:relative">© {new Date().getFullYear()} CDS Space | Branding Agency.</p>
          <div className="flex md:gap-4 gap-32 mt-2 md:mt-0 ">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/legal/aml-ctf-policy">AML/CTF policy</Link>
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-gray-700 w-full px-7 md:hidden">
        <div className="pt-4 md:text-sm text-xs  space-y-4">
          <p> <Link href="/privacy">Privacy Policy</Link></p>
          <p> <Link href="/terms">Terms of Service</Link></p>
          <p> <Link href="/legal/aml-ctf-policy">AML/CTF policy</Link></p>
          <p>© {new Date().getFullYear()} CDS Space | Branding Agency.</p>
        </div>
      </div>

    </footer>
  );
}
