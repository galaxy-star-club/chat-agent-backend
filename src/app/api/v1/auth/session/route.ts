import { authController } from "@/modules/auth/auth.controller";

export function GET(request: Request): Promise<Response> {
  return authController(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return authController(request);
}

export function HEAD(request: Request): Promise<Response> {
  return authController(request);
}

export function POST(request: Request): Promise<Response> {
  return authController(request);
}

export function PUT(request: Request): Promise<Response> {
  return authController(request);
}

export function PATCH(request: Request): Promise<Response> {
  return authController(request);
}

export function DELETE(request: Request): Promise<Response> {
  return authController(request);
}
