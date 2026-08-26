import ErrorScreen from "@/components/error/ErrorScreen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      badge="Error 404"
      eyebrow="The trail went quiet"
      title="This path ends here."
      titleAccent="Your journey doesn't."
      body="The page you're looking for may have moved or no longer exists. Return home, or continue exploring the work shaping ambitious brands."
    />
  );
}
