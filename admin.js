const year = document.getElementById('year');
const orderIdInput = document.getElementById('orderId');
const reviewKeyInput = document.getElementById('reviewKey');
const noteInput = document.getElementById('adminNote');
const statusText = document.getElementById('admin-status');
const orderJson = document.getElementById('admin-order-json');
const actionButtons = document.querySelectorAll('[data-action]');

year.textContent = String(new Date().getFullYear());

const setStatus = (text) => {
  statusText.textContent = text;
};

const getOrderId = () => orderIdInput.value.trim().toUpperCase();
const getReviewKey = () => reviewKeyInput.value.trim();

const renderOrder = (order) => {
  orderJson.textContent = JSON.stringify(order, null, 2);
};

const loadOrder = async () => {
  const orderId = getOrderId();
  if (!orderId) {
    setStatus('Enter an order ID first.');
    return;
  }

  setStatus(`Loading ${orderId}...`);
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Could not load order.');
  }

  renderOrder(data.order);
  setStatus(`Loaded ${orderId}.`);
};

const updateOrderStatus = async (nextStatus) => {
  const orderId = getOrderId();
  const reviewKey = getReviewKey();

  if (!orderId || !reviewKey) {
    setStatus('Order ID and review key are required.');
    return;
  }

  setStatus(`Updating ${orderId} to ${nextStatus}...`);

  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-review-key': reviewKey,
    },
    body: JSON.stringify({
      status: nextStatus,
      note: noteInput.value.trim(),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Could not update order status.');
  }

  renderOrder(data.order);
  setStatus(`Updated ${orderId} to ${data.order.status}.`);
};

const handleAction = async (action) => {
  try {
    if (action === 'load') {
      await loadOrder();
      return;
    }

    if (action === 'review') {
      await updateOrderStatus('file_review');
      return;
    }

    if (action === 'approve') {
      await updateOrderStatus('fully_confirmed');
      return;
    }

    if (action === 'cancel') {
      await updateOrderStatus('canceled');
    }
  } catch (error) {
    setStatus(error?.message || 'Admin request failed.');
  }
};

actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    handleAction(button.dataset.action);
  });
});
