const orderIdValue = document.getElementById('orderIdValue');
const orderStageValue = document.getElementById('orderStageValue');
const orderStatusNote = document.getElementById('orderStatusNote');
const refreshOrderStatusButton = document.getElementById('refreshOrderStatus');

const orderStageLabel = {
  file_review: 'File review in progress',
  fully_confirmed: 'Fully confirmed',
  canceled: 'Canceled',
};

const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId') ?? '';

const renderOrder = (order) => {
  orderIdValue.textContent = order.id;
  orderStageValue.textContent = orderStageLabel[order.status] ?? order.status;
  orderStatusNote.textContent = order.note || 'Status is available.';
};

const fetchOrder = async () => {
  if (!orderId) {
    orderStatusNote.textContent = 'No order ID provided. Return to quote page and confirm a quote first.';
    return;
  }

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
    if (!response.ok) {
      throw new Error('Order status unavailable');
    }

    const data = await response.json();
    renderOrder(data.order);
  } catch {
    orderStatusNote.textContent = 'Could not load order status right now.';
  }
};

refreshOrderStatusButton.addEventListener('click', fetchOrder);
fetchOrder();
