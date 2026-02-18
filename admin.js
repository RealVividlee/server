const year = document.getElementById('year');
const orderIdInput = document.getElementById('orderId');
const reviewKeyInput = document.getElementById('reviewKey');
const noteInput = document.getElementById('adminNote');
const statusText = document.getElementById('admin-status');
const orderJson = document.getElementById('admin-order-json');
const orderSimple = document.getElementById('admin-order-simple');
const ordersList = document.getElementById('ordersList');
const refreshOrdersButton = document.getElementById('refreshOrders');
const toggleViewButton = document.getElementById('toggleView');
const downloadOrderFileButton = document.getElementById('downloadOrderFile');
const actionButtons = document.querySelectorAll('[data-action]');

const simpleId = document.getElementById('simple-id');
const simpleStatus = document.getElementById('simple-status');
const simpleEmail = document.getElementById('simple-email');
const simpleProject = document.getElementById('simple-project');
const simpleTotal = document.getElementById('simple-total');
const simpleMission = document.getElementById('simple-mission');
const simpleCreated = document.getElementById('simple-created');
const simpleUpdated = document.getElementById('simple-updated');
const simpleNote = document.getElementById('simple-note');
const simpleFile = document.getElementById('simple-file');

const adminReceiptMeta = document.getElementById('adminReceiptMeta');
const adminReceiptId = document.getElementById('adminReceiptId');
const adminReceiptIssued = document.getElementById('adminReceiptIssued');
const adminReceiptOrder = document.getElementById('adminReceiptOrder');
const adminReceiptEmail = document.getElementById('adminReceiptEmail');
const adminReceiptProject = document.getElementById('adminReceiptProject');
const adminReceiptMaterial = document.getElementById('adminReceiptMaterial');
const adminReceiptQuantity = document.getElementById('adminReceiptQuantity');
const adminReceiptTotal = document.getElementById('adminReceiptTotal');
const adminReceiptLines = document.getElementById('adminReceiptLines');

year.textContent = String(new Date().getFullYear());

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

let selectedOrder;
let showRawView = true;

const setStatus = (text) => {
  statusText.textContent = text;
};

const getOrderId = () => orderIdInput.value.trim().toUpperCase();
const getReviewKey = () => reviewKeyInput.value.trim();

const formatDate = (iso) => {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return String(iso);
  }

  return date.toLocaleString();
};

const renderSimpleOrder = (order) => {
  simpleId.textContent = order?.id || '—';
  simpleStatus.textContent = order?.status || '—';
  simpleEmail.textContent = order?.customerEmail || '—';
  simpleProject.textContent = order?.orderDetails?.projectName || '—';
  simpleTotal.textContent = typeof order?.orderDetails?.total === 'number' ? currency.format(order.orderDetails.total) : '—';
  simpleMission.textContent = order?.mission || '—';
  simpleCreated.textContent = formatDate(order?.createdAt);
  simpleUpdated.textContent = formatDate(order?.updatedAt);
  simpleNote.textContent = order?.note || '—';
  simpleFile.textContent = order?.uploadedFile?.originalName || 'No upload';
};

const renderAdminReceipt = (order) => {
  const receipt = order?.receipt;

  if (!order) {
    adminReceiptMeta.textContent = 'Receipt will appear once an order is fully confirmed.';
    adminReceiptId.textContent = '—';
    adminReceiptIssued.textContent = '—';
    adminReceiptOrder.textContent = '—';
    adminReceiptEmail.textContent = '—';
    adminReceiptProject.textContent = '—';
    adminReceiptMaterial.textContent = '—';
    adminReceiptQuantity.textContent = '—';
    adminReceiptTotal.textContent = '—';
    adminReceiptLines.innerHTML = '';
    return;
  }

  if (!receipt) {
    adminReceiptMeta.textContent = 'Receipt not generated yet. Approve this order to create a receipt.';
    adminReceiptId.textContent = 'Pending approval';
    adminReceiptIssued.textContent = '—';
    adminReceiptOrder.textContent = order.id || '—';
    adminReceiptEmail.textContent = order.customerEmail || '—';
    adminReceiptProject.textContent = order.orderDetails?.projectName || '—';
    adminReceiptMaterial.textContent = order.orderDetails?.material || '—';
    adminReceiptQuantity.textContent = String(order.orderDetails?.quantity ?? '—');
    adminReceiptTotal.textContent = typeof order.orderDetails?.total === 'number' ? currency.format(order.orderDetails.total) : '—';
    adminReceiptLines.innerHTML = '';
    return;
  }

  adminReceiptMeta.textContent = 'Generated receipt for an approved order.';
  adminReceiptId.textContent = receipt.receiptId || '—';
  adminReceiptIssued.textContent = formatDate(receipt.issuedAt);
  adminReceiptOrder.textContent = receipt.orderId || '—';
  adminReceiptEmail.textContent = receipt.customerEmail || '—';
  adminReceiptProject.textContent = receipt.orderSnapshot?.projectName || '—';
  adminReceiptMaterial.textContent = receipt.orderSnapshot?.material || '—';
  adminReceiptQuantity.textContent = String(receipt.orderSnapshot?.quantity ?? '—');
  adminReceiptTotal.textContent = typeof receipt.total === 'number' ? currency.format(receipt.total) : '—';
  adminReceiptLines.innerHTML = (receipt.lineItems || [])
    .map((item) => `<li><span>${item.label}</span><strong>${currency.format(Number(item.amount || 0))}</strong></li>`)
    .join('');
};

const renderSelectedOrder = () => {
  if (!selectedOrder) {
    orderJson.textContent = 'Select or load an order to see details.';
    orderSimple.hidden = true;
    orderJson.hidden = false;
    toggleViewButton.disabled = true;
    toggleViewButton.textContent = 'Switch to simplified view';
    simpleFile.textContent = '—';
    renderAdminReceipt(undefined);
    return;
  }

  orderJson.textContent = JSON.stringify(selectedOrder, null, 2);
  renderSimpleOrder(selectedOrder);
  renderAdminReceipt(selectedOrder);
  toggleViewButton.disabled = false;

  if (showRawView) {
    orderJson.hidden = false;
    orderSimple.hidden = true;
    toggleViewButton.textContent = 'Switch to simplified view';
  } else {
    orderJson.hidden = true;
    orderSimple.hidden = false;
    toggleViewButton.textContent = 'Switch to raw view';
  }
};

const selectOrder = (order) => {
  selectedOrder = order;
  orderIdInput.value = order.id || '';
  renderSelectedOrder();
};

const renderOrdersList = (orders) => {
  if (!orders.length) {
    ordersList.innerHTML = '<li class="orders-list-empty">No orders yet.</li>';
    return;
  }

  ordersList.innerHTML = orders
    .map((order) => {
      const projectName = order?.orderDetails?.projectName || 'Untitled project';
      return `<li>
        <button type="button" class="order-list-item" data-order-id="${order.id}">
          <span><strong>${order.id}</strong> · ${projectName}</span>
          <span class="order-list-meta">${order.status}</span>
        </button>
      </li>`;
    })
    .join('');

  ordersList.querySelectorAll('.order-list-item').forEach((button) => {
    button.addEventListener('click', () => {
      const order = orders.find((item) => item.id === button.dataset.orderId);
      if (order) {
        selectOrder(order);
        setStatus(`Selected ${order.id}.`);
      }
    });
  });
};

const loadAllOrders = async () => {
  const reviewKey = getReviewKey();
  if (!reviewKey) {
    throw new Error('Enter your review key to load orders.');
  }

  const response = await fetch('/api/orders', {
    headers: {
      'x-review-key': reviewKey,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Could not load order list.');
  }

  const orders = Array.isArray(data.orders) ? data.orders : [];
  renderOrdersList(orders);

  if (selectedOrder) {
    const refreshedSelected = orders.find((order) => order.id === selectedOrder.id);
    if (refreshedSelected) {
      selectedOrder = refreshedSelected;
      renderSelectedOrder();
    }
  }

  return orders;
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

  selectOrder(data.order);
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

  selectOrder(data.order);
  await loadAllOrders();
  setStatus(`Updated ${orderId} to ${data.order.status}.`);
};


const downloadSelectedOrderFile = async () => {
  const orderId = getOrderId();
  const reviewKey = getReviewKey();

  if (!orderId || !reviewKey) {
    setStatus('Order ID and review key are required.');
    return;
  }

  setStatus(`Downloading uploaded file for ${orderId}...`);
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/file`, {
    headers: {
      'x-review-key': reviewKey,
    },
  });

  if (!response.ok) {
    let message = 'Could not download uploaded file.';
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const contentDisposition = response.headers.get('content-disposition') || '';
  const fallbackName = selectedOrder?.uploadedFile?.originalName || `${orderId}-upload.bin`;
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] || fallbackName;

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);

  setStatus(`Downloaded ${fileName}.`);
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

refreshOrdersButton.addEventListener('click', async () => {
  try {
    setStatus('Refreshing order list...');
    const orders = await loadAllOrders();
    setStatus(`Loaded ${orders.length} order${orders.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(error?.message || 'Could not refresh order list.');
  }
});

toggleViewButton.addEventListener('click', () => {
  showRawView = !showRawView;
  renderSelectedOrder();
});

downloadOrderFileButton.addEventListener('click', async () => {
  try {
    await downloadSelectedOrderFile();
  } catch (error) {
    setStatus(error?.message || 'Could not download uploaded file.');
  }
});

renderSelectedOrder();
loadAllOrders()
  .then((orders) => {
    setStatus(`Loaded ${orders.length} order${orders.length === 1 ? '' : 's'}.`);
  })
  .catch((error) => {
    setStatus(error?.message || 'Could not load order list.');
  });
