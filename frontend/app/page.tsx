import { Card, Container, InlineRow } from "./components/Ui";

export default function Home() {
  return (
    <Container>
      <h2>Smart Tourist Monitoring System — Test UI</h2>
      <p>
        Use this frontend to test Supabase Auth + DB integration and the FastAPI
        backend features (zones, pings, alerts, OCR verification).
      </p>

      <Card title="Quick links">
        <InlineRow>
          <a href="/register">Register</a>
          <a href="/login">Login</a>
          <a href="/user/dashboard">User dashboard</a>
          <a href="/authority/dashboard">Authority dashboard</a>
        </InlineRow>
      </Card>
    </Container>
  );
}
