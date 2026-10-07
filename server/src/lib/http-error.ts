export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'กรุณาเข้าสู่ระบบก่อน') {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'ไม่มีสิทธิ์เข้าถึง') {
    return new HttpError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'ไม่พบข้อมูลที่ต้องการ') {
    return new HttpError(404, message, 'NOT_FOUND');
  }
  static conflict(message = 'ข้อมูลซ้ำกับที่มีอยู่แล้ว') {
    return new HttpError(409, message, 'CONFLICT');
  }
  static payloadTooLarge(message = 'ไฟล์ใหญ่เกินไป') {
    return new HttpError(413, message, 'PAYLOAD_TOO_LARGE');
  }
  static tooManyRequests(message = 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่') {
    return new HttpError(429, message, 'TOO_MANY_REQUESTS');
  }
  static internal(message = 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์') {
    return new HttpError(500, message, 'INTERNAL_ERROR');
  }
}