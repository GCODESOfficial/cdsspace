import { verifyUser } from "@/lib/admin-auth";
import { createClientBooking } from "@/lib/mobile-client-data";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// "Book a session": same fields and required ones as the web form.
export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return mobileJson({ error: "Unauthorized" }, 401);

  const body = await readMobileBody(request);
  const fullName = str(body.fullName).trim().slice(0, 200);
  const email = str(body.email).trim().slice(0, 320);
  const topic = str(body.topic).trim().slice(0, 500);
  const date = str(body.date).trim();
  const duration = Number(body.duration);
  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !topic || !DATE.test(date)) {
    return mobileJson({ error: "Enter your name, email, topic and preferred date." }, 400);
  }
  const booking = await createClientBooking(session.user.id, {
    fullName,
    email,
    topic,
    date,
    phone: str(body.phone).trim().slice(0, 40),
    time: str(body.time).trim().slice(0, 60),
    duration: [15, 30, 60].includes(duration) ? duration : 30,
    notes: str(body.notes).trim().slice(0, 2000),
  });
  return mobileJson({ ok: true, booking }, 201);
}
