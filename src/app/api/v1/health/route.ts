import { healthController } from "@/modules/health/health.controller";

export function GET(request: Request): Response {
  return healthController(request);
}

export function OPTIONS(request: Request): Response {
  return healthController(request);
}

export function HEAD(request: Request): Response {
  return healthController(request);
}

export function POST(request: Request): Response {
  return healthController(request);
}

export function PUT(request: Request): Response {
  return healthController(request);
}

export function PATCH(request: Request): Response {
  return healthController(request);
}

export function DELETE(request: Request): Response {
  return healthController(request);
}
