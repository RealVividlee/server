const orderIdValue = document.getElementById('orderIdValue');
const orderStageValue = document.getElementById('orderStageValue');
const orderStatusNote = document.getElementById('orderStatusNote');
const refreshOrderStatusButton = document.getElementById('refreshOrderStatus');

const clientReceiptCard = document.getElementById('clientReceiptCard');
const clientReceiptMeta = document.getElementById('clientReceiptMeta');
const clientReceiptId = document.getElementById('clientReceiptId');
const clientReceiptIssued = document.getElementById('clientReceiptIssued');
const clientReceiptOrder = document.getElementById('clientReceiptOrder');
const clientReceiptEmail = document.getElementById('clientReceiptEmail');
const clientReceiptProject = document.getElementById('clientReceiptProject');
const clientReceiptMaterial = document.getElementById('clientReceiptMaterial');
const clientReceiptQuantity = document.getElementById('clientReceiptQuantity');
const clientReceiptTotal = document.getElementById('clientReceiptTotal');
const clientReceiptLines = document.getElementById('clientReceiptLines');

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const orderStageLabel = {
  file_review: 'File review in progress',
  fully_confirmed: 'Fully confirmed',
  canceled: 'Canceled',
};

const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId') ?? '';
const orderToken = params.get('token') ?? '';

const renderReceipt = (receipt) => {
  if (!receipt) {
    clientReceiptCard.hidden = true;
    clientReceiptLines.innerHTML = '';
    return;
  }

  clientReceiptCard.hidden = false;
  clientReceiptMeta.textContent = 'This receipt is generated when your order is fully approved.';
  clientReceiptId.textContent = receipt.receiptId || '—';
  clientReceiptIssued.textContent = receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleString() : '—';
  clientReceiptOrder.textContent = receipt.orderId || '—';
  clientReceiptEmail.textContent = receipt.customerEmail || '—';
  clientReceiptProject.textContent = receipt.orderSnapshot?.projectName || '—';
  clientReceiptMaterial.textContent = receipt.orderSnapshot?.material || '—';
  clientReceiptQuantity.textContent = String(receipt.orderSnapshot?.quantity ?? '—');
  clientReceiptTotal.textContent = typeof receipt.total === 'number' ? currency.format(receipt.total) : '—';

  clientReceiptLines.innerHTML = (receipt.lineItems || [])
    .map((item) => `<li><span>${item.label}</span><strong>${currency.format(Number(item.amount || 0))}</strong></li>`)
    .join('');
};

const renderOrder = (order) => {
  orderIdValue.textContent = order.id;
  orderStageValue.textContent = orderStageLabel[order.status] ?? order.status;
  orderStatusNote.textContent = order.note || 'Status is available.';

  if (order.status === 'fully_confirmed') {
    renderReceipt(order.receipt);
  } else {
    clientReceiptCard.hidden = false;
    clientReceiptMeta.textContent = 'Receipt will appear once this order is fully confirmed.';
    clientReceiptId.textContent = 'Pending approval';
    clientReceiptIssued.textContent = '—';
    clientReceiptOrder.textContent = order.id;
    clientReceiptEmail.textContent = order.customerEmail || '—';
    clientReceiptProject.textContent = order.orderDetails?.projectName || '—';
    clientReceiptMaterial.textContent = order.orderDetails?.material || '—';
    clientReceiptQuantity.textContent = String(order.orderDetails?.quantity ?? '—');
    clientReceiptTotal.textContent = typeof order.orderDetails?.total === 'number' ? currency.format(order.orderDetails.total) : '—';
    clientReceiptLines.innerHTML = '';
  }
};

const fetchOrder = async () => {
  if (!orderId || !orderToken) {
    orderStatusNote.textContent = 'Missing secure tracking info. Use the exact status link from your order confirmation.';
    return;
  }

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      headers: orderToken ? { 'x-order-token': orderToken } : {},
    });
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
