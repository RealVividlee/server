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
  simpleProject.textContent = order?.quote?.projectName || '—';
  simpleTotal.textContent = typeof order?.quote?.total === 'number' ? currency.format(order.quote.total) : '—';
  simpleMission.textContent = order?.mission || '—';
  simpleCreated.textContent = formatDate(order?.createdAt);
  simpleUpdated.textContent = formatDate(order?.updatedAt);
  simpleNote.textContent = order?.note || '—';
};

const renderSelectedOrder = () => {
  if (!selectedOrder) {
    orderJson.textContent = 'Select or load an order to see details.';
    orderSimple.hidden = true;
    orderJson.hidden = false;
    toggleViewButton.disabled = true;
    toggleViewButton.textContent = 'Switch to simplified view';
    return;
  }

  orderJson.textContent = JSON.stringify(selectedOrder, null, 2);
  renderSimpleOrder(selectedOrder);
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
      const projectName = order?.quote?.projectName || 'Untitled project';
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
      const orderId = button.dataset.orderId;
      const order = orders.find((item) => item.id === orderId);
      if (order) {
        selectOrder(order);
        setStatus(`Selected ${order.id}.`);
      }
    });
  });
};

const loadAllOrders = async () => {
  const response = await fetch('/api/orders');
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

renderSelectedOrder();
loadAllOrders()
  .then((orders) => {
    setStatus(`Loaded ${orders.length} order${orders.length === 1 ? '' : 's'}.`);
  })
  .catch((error) => {
    setStatus(error?.message || 'Could not load order list.');
  });
