import { databaseController } from "@/modules/readiness/database-readiness.controller";

export function GET(request: Request): Promise<Response> {
  return databaseController(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return databaseController(request);
}

export function HEAD(request: Request): Promise<Response> {
  return databaseController(request);
}

export function POST(request: Request): Promise<Response> {
  return databaseController(request);
}

export function PUT(request: Request): Promise<Response> {
  return databaseController(request);
}

export function PATCH(request: Request): Promise<Response> {
  return databaseController(request);
}

export function DELETE(request: Request): Promise<Response> {
  return databaseController(request);
}
