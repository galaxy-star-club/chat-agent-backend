import { chatController } from "@/modules/chats/chat.controller";

export function GET(request: Request): Promise<Response> { return chatController(request, "collection"); }
export function POST(request: Request): Promise<Response> { return chatController(request, "collection"); }
export function HEAD(request: Request): Promise<Response> { return chatController(request, "collection"); }
export function OPTIONS(request: Request): Promise<Response> { return chatController(request, "collection"); }
export function PUT(request: Request): Promise<Response> { return chatController(request, "collection"); }
export function PATCH(request: Request): Promise<Response> { return chatController(request, "collection"); }
export function DELETE(request: Request): Promise<Response> { return chatController(request, "collection"); }
