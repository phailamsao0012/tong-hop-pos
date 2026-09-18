// Cho phép import nội dung file dạng chuỗi (Vite `?raw`) — dùng để nhúng Chart.js vào file slide xuất ra.
declare module '*?raw' { const content: string; export default content; }
