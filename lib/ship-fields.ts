import type { SourceOrder } from '@/lib/pancake';

export const RETURN_REASONS: Record<number, string> = {
  1: 'Do khách hàng',
  2: 'Do nhân viên',
  3: 'Do sản phẩm lỗi',
  4: 'Do đơn vị vận chuyển',
  5: 'Do đổi hàng',
};
export const PARTNER_STATUS_LABELS: Record<string, string> = {
  waiting: 'Chờ xử lý',
  request_received: 'ĐVVC đã tiếp nhận đơn',
  processing_picked_up: 'Đang xử lý lấy hàng',
  picking_up: 'Đang lấy hàng',
  delay_pickup: 'Trễ lấy hàng',
  picked_up: 'Đã lấy hàng',
  waiting_on_the_way: 'Chờ trung chuyển',
  on_the_way: 'Đang trung chuyển',
  contact_delivery_company: 'Liên hệ ĐVVC',
  out_for_delivery: 'Đang giao hàng',
  delay_delivery: 'Trễ giao hàng',
  inform_recipient: 'Thông báo cho người nhận',
  undeliverable: 'Giao không thành',
  waiting_for_return: 'Chờ chuyển hoàn',
  delivered: 'Đã giao hàng',
  delivered_cod: 'Đã giao hàng, đã đối soát COD',
  returning: 'Đang chuyển hoàn',
  returned: 'Đã chuyển hoàn',
  returned_cod: 'Đã chuyển hoàn, đã đối soát COD',
  canceled: 'Đã hủy vận đơn',
};
export const NO_CARRIER = 'Chưa có hãng';
export const NO_PROVINCE = 'Chưa rõ tỉnh';
export const NO_RETURN_REASON = 'Chưa ghi lý do hoàn';
const clean = (v: string | null | undefined) => v?.trim() || null;

export function normalizeProvince(name: string | null | undefined): string | null {
  return clean(clean(name)?.replace(/^(Tỉnh |Thành phố |TP\. )/, ''));
}

export function returnReasonOf(o: Pick<SourceOrder, 'returned_reason' | 'returned_reason_name'>): string | null {
  return clean(o.returned_reason_name) ?? (o.returned_reason == null ? null : RETURN_REASONS[o.returned_reason] ?? `Lý do số ${o.returned_reason}`);
}

export function shipFields(o: SourceOrder) {
  return {
    carrier: clean(o.partner?.partner_name),
    province: normalizeProvince(o.shipping_address?.province_name),
    partnerStatus: clean(o.partner?.partner_status),
    undeliverableAt: clean(o.partner?.first_undeliverable_at),
    returnedReason: returnReasonOf(o),
  };
}
