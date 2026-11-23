// Địa chỉ API (URL ứng dụng web Apps Script, kết thúc bằng /exec).
// Sau khi triển khai Apps Script, dán URL vào đây rồi đưa lại lên GitHub.
export const API_URLS = {
  PROD: '',   // ví dụ: 'https://script.google.com/macros/s/AKfy.../exec'
  DEMO: 'https://script.google.com/macros/s/AKfycbxaWKz3WqNxuaOBzhxggWVDIxvG5g9kWyK9kpVNrWaQPDdQAxk1b8KdZ9ZkSZd3BiPf/exec'
};

// Trang nằm trong thư mục /demo/ thì dùng DEMO, còn lại dùng PROD.
export const ENV = /\/demo(\/|$)/.test(location.pathname) ? 'DEMO' : 'PROD';
export const API_URL = API_URLS[ENV];
export const APP_VERSION = '0.4.0';
