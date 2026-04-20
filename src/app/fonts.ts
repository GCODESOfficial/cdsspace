import localFont from "next/font/local";

// Monotype Corsiva font family
export const monotypeCorsiva = localFont({
  src: [
    {
      path: "../../public/fonts/Monotype-Corsiva-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Monotype-Corsiva-Regular-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/Monotype-Corsiva-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/Monotype-Corsiva-Bold-Italic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-monotype-corsiva",
  display: "swap",
});

// Plus Jakarta Sans variable font
export const plusJakartaSans = localFont({
  src: [
    {
      path: "../../public/fonts/PlusJakartaSans.ttf",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../public/fonts/PlusJakartaSans-Italic.ttf",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});
