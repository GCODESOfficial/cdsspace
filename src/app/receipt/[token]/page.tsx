import ReceiptClient from "./ReceiptClient";

export const metadata = {
  title: "Payment Receipt - CDS Space",
  robots: { index: false, follow: false },
};

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReceiptClient token={token} />;
}
