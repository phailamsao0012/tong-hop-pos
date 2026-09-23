export const STAGES = ['all', 'unconfirmed', 'confirmed', 'confirmed_now', 'stock', 'packing', 'waiting', 'shipping', 'shipped', 'delivered', 'returned', 'cancelled', 'deleted'] as const;
export type MarketingStage = typeof STAGES[number];

export const stageSql = (stage: MarketingStage, alias = 'o') => {
  const status = `${alias}.status_code`;
  switch (stage) {
    case 'unconfirmed': return `${status} IN (0,17)`;
    case 'confirmed': return `${alias}.first_confirmed_at IS NOT NULL AND ${status} NOT IN (0,17,6,7)`;
    case 'confirmed_now': return `${status}=1`;
    case 'stock': return `${status} IN (11,12,13,20)`;
    case 'packing': return `${status}=8`;
    case 'waiting': return `${status}=9`;
    case 'shipping': return `${status}=2`;
    case 'shipped': return `${status} IN (2,3,16,4,5,15)`;
    case 'delivered': return `${status} IN (3,16)`;
    case 'returned': return `${status} IN (4,5,15)`;
    case 'cancelled': return `${status}=6`;
    case 'deleted': return `${status}=7`;
    default: return `${status}<>7`;
  }
};

export const itemKey = (alias = 'i') => `CASE WHEN NULLIF(TRIM(${alias}.product_id),'') IS NOT NULL THEN 'p:'||TRIM(${alias}.product_id) WHEN NULLIF(TRIM(${alias}.variation_id),'') IS NOT NULL THEN 'v:'||TRIM(${alias}.variation_id) ELSE 'n:'||TRIM(${alias}.name) END`;
export const saleItemPredicate = (alias = 'i') => `COALESCE(${alias}.is_bonus,0)=0 AND COALESCE(${alias}.quantity,0)>0 AND TRIM(COALESCE(${alias}.name,'')) NOT LIKE 'quà tặng%'`;
export const productExists = (alias = 'o') => `EXISTS (SELECT 1 FROM raw_pos_order_items pf WHERE pf.order_id=${alias}.id AND ${saleItemPredicate('pf')} AND ${itemKey('pf')}=?)`;

// Cột chuẩn hóa lấy trực tiếp từ `order_sources` của đơn Pancake. JSON gốc rất
// lớn và page/post/ad không có trường đảm bảo, nên không quét JSON để suy đoán.
export const SOURCE_FIELD = `NULLIF(TRIM(o.order_source),'')`;
