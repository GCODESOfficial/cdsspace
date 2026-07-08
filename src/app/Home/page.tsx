import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import VideoPreviewPlayer from "@/components/VideoPreviewPlayer";
import AnimatedTags from "@/components/AnimatedTags";

// Below-the-fold sections - code-split so the hero paints fast.
const ExperienceCarousel = dynamic(() => import("@/components/ExperienceCarousel"));
const Aboutus = dynamic(() => import("@/components/Aboutus"));
const BrandsAndOurProjects = dynamic(() => import("@/components/BrandsAndOurProjects"));
const Testimonials = dynamic(() => import("@/components/Testimonials"));
const LetsBuildYourBrand = dynamic(() => import("@/components/LetsBuildYourBrand"));
export default function Home() {
  return (
    <div className="bg-white text-[#020839] overflow-hidden font-[plusJakartaSans]">
      <VideoPreviewPlayer />

      <section className="flex flex-col md:flex-row max-w-7xl mx-auto items-center min-h-screen justify-between gap-10 bg-[#F4F6FB] p-5 md:px-10 w-full">
        <div className="w-full text-left font-[plusJakartaSans]">
          <h2 className="text-xl md:text-3xl font-semibold text-[#0B0B0C] leading-none md:leading-10">
            Same Product. <br />
            <span className="text-[#2458E8] text-3xl md:text-5xl font-normal font-[MonotypeCorsivaRegular]">
              Different Story.
            </span>
          </h2>

          <p className="text-base md:w-[80%] font-normal md:text-xl mt-2 md:mt-4 md:leading-6 mb-2 md:mb-4">
            Both serve their purpose, but only the <br />
            <strong className="font-semibold text-black">
              {" "}
              branded one is remembered.
            </strong>
          </p>

          <p className="text-base md:w-[80%] font-normal md:text-xl md:leading-6">
            Two products. One plain, one branded. Both clean, but only one gets
            chosen, remembered, and requested. Branding gives meaning to what
            people already need.
          </p>

          <Link
            href="/Works"
            className="mt-6 px-6 py-4 bg-[#1C4ED1] hover:bg-[#1E47C5] text-white text-sm 
            md:text-base font-medium rounded-full transition-all font-[plusJakartaSans] inline-block"
          >
            Let&apos;s Build Your Brand
          </Link>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-2">
          {/* VIDEO */}
          <div className="relative w-full md:w-[400px] aspect-3/4 md:aspect-auto h-full md:h-[500px] flex justify-center items-center">
            <video
              src="/brand-container-video.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              draggable={false}
              className="rounded-3xl rounded-bl-[180px] w-full h-full object-cover"
            />

            <Image
              src="/images/blue-tick.svg"
              alt="blue tick"
              width={55}
              height={55}
              className="absolute bottom-0 left-0 w-30 h-30 z-10"
            />
          </div>

          {/* IMAGES COLUMN */}
          <div className="relative w-full md:w-72 md:h-[500px] flex flex-col items-center md:justify-between gap-2">
            <div className="w-full h-full md:h-1/2 aspect-square md:aspect-auto rounded-3xl bg-linear-to-br from-[#08129C] to-[#072056] flex items-center justify-center">
              <Image
                src="/images/unbranded_container.svg"
                alt="Unbranded Container"
                width={120}
                height={120}
                className="object-contain w-2/4 h-3/4 md:w-auto md:h-52"
              />
            </div>

            <Image
              src="/images/arrow-down.svg"
              alt="Arrow Down"
              width={40}
              height={40}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
            />

            <div className="w-full h-full md:h-1/2 aspect-square md:aspect-auto rounded-3xl bg-linear-to-br from-[#08129C] to-[#072056] flex items-center justify-center">
              <Image
                src="/images/branded_container.svg"
                alt="Branded Container"
                width={120}
                height={120}
                className="object-contain w-2/4 h-3/4 md:w-auto md:h-52"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="w-full min-h-screen max-w-7xl mx-auto bg-[#F4F6FB] py-16 px-4 md:px-10 font-[plusJakartaSans]">
        <div className="flex flex-col-reverse md:flex-row items-center justify-between gap-4 w-full">
          <div className="flex flex-col md:flex-row gap-2 relative">
            <div className="">
              <Image
                src="/images/event-unbranded.svg"
                alt="Unbranded Event"
                width={300}
                height={400}
                className="w-full h-auto object-contain rounded-xl"
              />
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block z-40">
              <Image
                src="/images/plane-arrow-right.svg"
                alt="Arrow"
                width={30}
                height={30}
              />
            </div>

            <div className="">
              <Image
                src="/images/event-branded.svg"
                alt="Branded Event"
                width={300}
                height={400}
                className="w-full h-auto object-contain rounded-xl"
              />
            </div>
          </div>

          <div className="flex-1 w-full text-left md:text-right">
            <h2 className="text-xl md:text-3xl font-semibold text-[#111] leading-none">
              Every event has a <br />
              <span className="text-[#1C4ED1] text-3xl md:text-5xl font-[MonotypeCorsivaRegular] font-semibold">
                Story{" "}
              </span>
              worth telling.
            </h2>

            <p className="text-[#121212] text-base md:text-xl mt-4 leading-6 md:leading-6 mb-4">
              Two events. One organized, one branded. Both happen, but only one{" "}
              <br className="hidden md:block" />
              lives beyond the day it ends. <br />
              Branding turns moments into memories,and{" "}
              <br className="hidden md:block" />
              experiences into stories.
            </p>

            <Link
              href="/Works"
              className="mt-6 px-6 py-4 bg-[#1C4ED1] hover:bg-[#1E47C5] text-white text-sm 
              md:text-base font-medium rounded-full transition-all font-[plusJakartaSans] inline-block"
            >
              Let&apos;s Build Your Brand
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full max-w-7xl mx-auto md:bg-[#ffffff] min-h-screen py-2 px-0 md:px-10 flex items-center justify-center">
        <div className="w-full  md:rounded-2xl bg-[#040B37] p-2 md:p-10">
          {/* HEADER */}
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="text-3xl md:text-4xl font-semibold text-white leading-none mt-4 md:leading-tight">
              Same{" "}
              <span className="font-[MonotypeCorsivaRegular] md:text-5xl bg-linear-to-br from-[#090c11] via-[#1C4ED1] to-[#040B37] bg-clip-text text-transparent">
                Brand
              </span>
              ,<br className="md:hidden block" /> New{" "}
              <span className="font-[MonotypeCorsivaRegular] md:text-5xl bg-linear-to-br from-[#1C4ED1] via-[#1C4ED1] to-[#040B37] bg-clip-text text-transparent">
                Energy
              </span>
            </h2>

            <p className="text-white text-sm md:text-lg mt-2 mx-auto max-w-[90%] leading-tight">
              A transformation that speaks the language of today - where every
              pixel, color, and curve tells a modern story of progress,
              creativity, and digital confidence.
            </p>
          </div>

          {/* CONTENT BOX */}
          <div className=" bg-white rounded-xl p-2">
            <div className="relative flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3">
              {/* LEFT VIDEO */}
              <div className="w-full md:w-[48%] h-[250px] md:h-auto rounded-xl overflow-hidden border-6 border-[#040B37]">
                <video
                  src="/videos/privix-old.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>

              {/* ARROW*/}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center justify-center z-20">
                <div className="w-20 h-20 md:w-30 md:h-30 flex items-center justify-center">
                  <Image
                    src="/images/arrow-right.svg"
                    alt="Arrow"
                    width={55}
                    height={55}
                  />
                </div>
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex md:hidden items-center justify-center z-20">
                <Image
                  src="/images/arrow-down-2.svg"
                  alt="arrow down"
                  width={20}
                  height={20}
                  className="md:hidden block h-10 w-10 mb-2"
                />
              </div>

              {/* RIGHT VIDEO */}
              <div className="w-full md:w-[48%] h-[250px] md:h-auto rounded-2xl overflow-hidden border-6 border-[#040B37]">
                <video
                  src="/videos/privix-new.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white  text-[#020839] py-16 px-5 md:px-16 font-[plusJakartaSans] w-full">
        {/* HEADER */}
        <div className="text-center max-w-3xl mx-auto mb-12 px-2 md:px-0">
          <h2 className="text-xl md:text-4xl leading-none font-semibold">
            We don’t just design for
            <span
              className="bg-[linear-gradient(180deg,#1C4ED1_0%,#0046FF_100%)]
              bg-clip-text text-transparent
              font-[MonotypeCorsivaRegular] text-3xl md:text-5xl"
            >
              Brands.
            </span>
            <br />
            We build the{" "}
            <span
              className="bg-[linear-gradient(180deg,#1C4ED1_0%,#0046FF_100%)]
              bg-clip-text text-transparent
              font-[MonotypeCorsivaRegular] text-3xl md:text-5xl"
            >
              feeling
            </span>{" "}
            people remember.
          </h2>
        </div>

        {/* THREE-COLUMN CONTENT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 items-center justify-between w-full md:max-w-7xl mx-auto">
          {/* CARD 1 */}
          <div className=" flex flex-col items-start justify-between text-left h-full  ">
            <div className=" space-y-4">
              <h3 className="text-lg font-semibold text-[#0B0B0C]">
                Share Your Vision
              </h3>
              <p className="text-[#555] text-sm md:text-base leading-relaxed">
                Tell us your brand dreams. We’ll make them real.
              </p>
            </div>
            <div className="flex bg-linear-to-b from-[#ffffff] to-[#5BA8FF] justify-center items-center">
              <Image
                src="/images/vision-illustration.gif"
                alt="Share Your Vision"
                width={200}
                height={200}
                className="object-contain w-full md:w-2/3 mx-auto"
              />
            </div>
          </div>

          {/* CARD 2 */}
          <AnimatedTags />

          {/* CARD 3 */}
          <div className="flex flex-col justify-between text-center md:text-left h-full">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#0B0B0C]">
                Get It Fast
              </h3>
              <p className="text-[#555] text-sm md:text-base leading-relaxed text-left">
                Your design, delivered in record time. No stress, just results.
              </p>
            </div>
            <div className="w-full max-w-full h-auto rounded-xl overflow-hidden">
              <video
                src="/videos/cds.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <ExperienceCarousel />
      {/* desktop view */}
      <div
        className="p-20 max-w-7xl mx-auto rounded-lg my-32 md:flex flex-col items-center justify-between gap-10 hidden"
        data-aos="fade-in"
      >
        <div className="flex-1 space-y-4" data-aos="fade-right">
          <div className="flex flex-col md:flex-row items-center md:justify-between gap-52 w-full max-w-none">
            <div className="flex flex-col gap-4 md:gap-6 w-sm">
              <p className="text-black" data-aos="fade-up">
                We are a branding and digital design agency that connects
                people, brands, and cultures.
              </p>
              <p className="text-black" data-aos="fade-up" data-aos-delay="100">
                Our service scope includes web3 & web2 product development,
                Brand Identity Design, Industrial Print Production, Brand
                Communications and Marketing, Environmental Branding, Brand
                Consultancy
              </p>

              <Link
                href="/Works"
                className=" py-2 md:w-40 text-[#1C4ED1] border border-[#1C4ED1] rounded-full hover:bg-gray-100 transition text-center "
                data-aos="fade-up"
                data-aos-delay="200"
              >
                See Our Project
              </Link>
            </div>

            <div className="flex-1 " data-aos="fade-left">
              <div className="text-center">
                <Image
                  src="/images/CDS Space logo.svg"
                  alt="CDS Logo"
                  width={800}
                  height={800}
                  className="mx-auto w-[800px] h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* mobile view */}
      <div
        className="p-4 px-5 rounded-lg my-20 flex flex-col items-center justify-center gap-8 md:hidden"
        data-aos="fade-in"
      >
        <div
          className="flex-1 space-y-4 justify-center flex"
          data-aos="fade-right"
        >
          <div className="flex flex-col gap-24 justify-center">
            <div className="flex flex-col gap-6 justify-center">
              <p className="text-black" data-aos="fade-up">
                We are a branding and digital design agency that connects
                people, brands, and cultures.
              </p>
              <p className="text-black" data-aos="fade-up" data-aos-delay="100">
                Our service scope includes web3 & web2 product development,
                Brand Identity Design, Industrial Print Production, Brand
                Communications and Marketing, Environmental Branding, Brand
                Consultancy
              </p>

              <div className="flex justify-center">
                <Link
                  href="/Works"
                  className=" py-2 md:w-40 text-[#1C4ED1] border border-[#1C4ED1] w-11/12 rounded-full hover:bg-gray-100 transition text-center"
                  data-aos="fade-up"
                  data-aos-delay="200"
                >
                  See Our Project
                </Link>
              </div>
            </div>

            <div
              className="flex-1 flex justify-center items-center"
              data-aos="fade-left"
            >
              <div className="text-center">
                <Image
                  src="/images/CDS Space logo.svg"
                  alt="CDS Logo"
                  width={400}
                  height={400}
                  className="mx-auto w-auto md:scale-100 md:w-auto md:h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-[#F4F6FB] py-16 px-4 md:px-16 rounded-3xl font-[plusJakartaSans] text-[#020839] w-full">
        {/* HEADER */}
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-2 px-2 md:px-0">
          <h2 className="text-xl md:text-4xl font-semibold">
            What we, bring to the{" "}
            <span className="text-[#154CDC] text-2xl md:text-5xl font-[MonotypeCorsivaRegular]">
              Table
            </span>
          </h2>
          <p className="text-[#555] md:w-[65%] mx-auto text-sm md:text-xl">
            Behind every great brand we build, is a clear process grounded in
            research, design, and care.
          </p>
        </div>

        {/* CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-4 w-full md:max-w-7xl mx-auto">
          {/* CARD 1 */}
          <div className="group rounded-2xl p-6 text-left shadow-sm hover:bg-[#154CDC] hover:bg-none hover:text-white bg-linear-to-r from-[#FFF] to-[#DFEAF8]">
            <div className=" w-12 h-12 bg-[#E0E7F1] rounded-lg mb-8 flex items-center justify-center">
              <Image
                src="/icons/design-control.svg"
                alt="Simple Design Control"
                width={30}
                height={30}
                className="object-contain"
              />
            </div>
            <h3 className=" group-hover:text-white font-semibold text-lg mb-2">
              Simple Design Control
            </h3>
            <p className=" group-hover:text-white text-sm text-[#555] leading-relaxed">
              Stay on top of your projects with an easy-to-use board, keeping
              everything clear and organized.
            </p>
          </div>

          {/* CARD 2 */}
          <div className="group rounded-2xl p-6 text-left shadow-sm hover:bg-[#154CDC] hover:bg-none hover:text-white bg-linear-to-r from-[#FFF] to-[#DFEAF8]">
            <div className="w-12 h-12 bg-[#E0E7F1] rounded-lg mb-8 flex items-center justify-center">
              <Image
                src="/icons/quick-turnaround.svg"
                alt="Quick Turnarounds"
                width={30}
                height={30}
                className="object-contain"
              />
            </div>
            <h3 className=" group-hover:text-white font-semibold text-lg mb-2">Quick Turnarounds</h3>
            <p className=" group-hover:text-white text-sm text-[#555] leading-relaxed">
              Get your designs fast, delivered one by one. No waiting, just
              quick, reliable results.
            </p>
          </div>

          {/* CARD 3 */}
          <div className="group rounded-2xl p-6 text-left shadow-sm hover:bg-[#154CDC] hover:bg-none hover:text-white bg-linear-to-r from-[#FFF] to-[#DFEAF8]">
            <div className="w-12 h-12 bg-[#E0E7F1] rounded-lg mb-8 flex items-center justify-center">
              <Image
                src="/icons/expert-quality.svg"
                alt="Expert-Level Quality"
                width={30}
                height={30}
                className="object-contain"
              />
            </div>
            <h3 className=" group-hover:text-white font-semibold text-lg mb-2">Expert-Level Quality</h3>
            <p className=" group-hover:text-white text-sm text-[#555] leading-relaxed">
              Work with experienced creatives who bring skill and creativity to
              every project.
            </p>
          </div>

          {/* CARD 4 & 5 ROW */}
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CARD 4 */}
            <div className="group rounded-2xl p-6 text-left shadow-sm bg-linear-to-r hover:bg-[#154CDC] hover:bg-none hover:text-white from-[#FFF] to-[#DFEAF8]">
              <div className="w-12 h-12 bg-[#E0E7F1] rounded-lg mb-8 flex items-center justify-center">
                <Image
                  src="/icons/flexible-options.svg"
                  alt="Flexible Options"
                  width={30}
                  height={30}
                  className="object-contain"
                />
              </div>
              <h3 className=" group-hover:text-white font-semibold text-lg mb-2">Flexible Options</h3>
              <p className="group-hover:text-white text-sm text-[#555] leading-relaxed">
                Your product needs to evolve, and so do we. Adjust your plan,
                expand projects, or pause anytime - it’s flexibility built for
                growth.
              </p>
            </div>

            {/* CARD 5 */}
            <div className="group rounded-2xl p-6 text-left shadow-sm hover:bg-[#154CDC] hover:bg-none hover:text-white bg-linear-to-r from-[#FFF] to-[#DFEAF8]">
              <div className="w-12 h-12 bg-[#E0E7F1] rounded-lg mb-8 flex items-center justify-center group-hover:text-[#154CDC]">
                <Image
                  src="/icons/custom-creations.svg"
                  alt="Custom Creations"
                  width={30}
                  height={30}
                  className="object-contain"
                />
              </div>
              <h3 className=" group-hover:text-white font-semibold text-lg mb-2">Custom Creations</h3>
              <p className=" group-hover:text-white text-sm text-[#555] leading-relaxed">
                Every product we craft is made uniquely for you. Authentic,
                timeless, and fully owned by your brand.
              </p>
            </div>
          </div>
        </div>
      </section>
      <Aboutus />

      <BrandsAndOurProjects />
      <Testimonials />

      <LetsBuildYourBrand />


    </div>
  );
}