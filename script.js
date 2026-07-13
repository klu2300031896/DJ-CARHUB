const DEFAULT_CARS = [
  "Toyota Innova",
  "Hyundai Creta",
  "Honda City",
  "Mahindra Thar",
  "Kia Seltos",
];

const STORAGE_KEYS = {
  cars: "carAvailabilityChecker.cars",
  bookings: "carAvailabilityChecker.bookings",
};

let cars = loadCars();
let bookings = loadBookings();
let lastCheck = null;
let toastTimer = null;

const availabilityForm = document.getElementById("availabilityForm");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const rangeNote = document.getElementById("rangeNote");
const fleetGrid = document.getElementById("fleetGrid");
const addCarForm = document.getElementById("addCarForm");
const newCarNameInput = document.getElementById("newCarName");
const removeCarForm = document.getElementById("removeCarForm");
const removeCarSelect = document.getElementById("removeCarSelect");
const bookingList = document.getElementById("bookingList");
const toast = document.getElementById("toast");

function loadCars() {
  const savedCars = readJson(STORAGE_KEYS.cars, null);
  if (!Array.isArray(savedCars)) {
    return [...DEFAULT_CARS];
  }

  const cleanCars = [];
  savedCars.forEach((car) => {
    const name = String(car).trim();
    if (name && !cleanCars.includes(name)) {
      cleanCars.push(name);
    }
  });

  return cleanCars.length ? cleanCars : [...DEFAULT_CARS];
}

function loadBookings() {
  const savedBookings = readJson(STORAGE_KEYS.bookings, {});
  const cleanBookings = {};

  cars.forEach((car) => {
    cleanBookings[car] = [];
    const ranges = Array.isArray(savedBookings[car]) ? savedBookings[car] : [];

    ranges.forEach((range) => {
      if (!Array.isArray(range) || range.length !== 2) {
        return;
      }

      const [start, end] = range;
      if (isIsoDate(start) && isIsoDate(end) && start <= end) {
        cleanBookings[car].push([start, end]);
      }
    });
  });

  return cleanBookings;
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.cars, JSON.stringify(cars));
  localStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(bookings));
}

function syncBookingsToCars() {
  cars.forEach((car) => {
    if (!Array.isArray(bookings[car])) {
      bookings[car] = [];
    }
  });

  Object.keys(bookings).forEach((car) => {
    if (!cars.includes(car)) {
      delete bookings[car];
    }
  });
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function rangesOverlap(selectedStart, selectedEnd, bookedStart, bookedEnd) {
  return selectedStart <= bookedEnd && bookedStart <= selectedEnd;
}

function isCarBooked(car, startDate, endDate) {
  return (bookings[car] || []).some(([bookedStart, bookedEnd]) =>
    rangesOverlap(startDate, endDate, bookedStart, bookedEnd)
  );
}

function getFleetStatus(startDate, endDate) {
  return cars.map((car) => ({
    car,
    booked: isCarBooked(car, startDate, endDate),
  }));
}

function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    showToast("Select both start and end dates.", "error");
    return false;
  }

  if (endDate < startDate) {
    showToast("End Date must be on or after Start Date.", "error");
    return false;
  }

  return true;
}

function renderFleetStatus() {
  fleetGrid.innerHTML = "";

  if (!lastCheck) {
    rangeNote.textContent = "Select a date range to view fleet status.";
    cars.forEach((car) => {
      fleetGrid.appendChild(createFleetTag({ car, booked: false }, true));
    });
    return;
  }

  rangeNote.textContent = `${formatDate(lastCheck.start)} to ${formatDate(lastCheck.end)}`;
  getFleetStatus(lastCheck.start, lastCheck.end).forEach((item) => {
    fleetGrid.appendChild(createFleetTag(item, false));
  });
}

function createFleetTag(item, disabledUntilSearch) {
  const tag = document.createElement("div");
  tag.className = "tag";

  const button = document.createElement("button");
  button.className = "tag-button";
  button.type = "button";
  button.disabled = disabledUntilSearch || item.booked;

  const statusClass = item.booked ? "booked" : "available";
  const statusText = item.booked ? "Booked" : "Available";
  const actionText = disabledUntilSearch
    ? "Check dates first"
    : item.booked
      ? "Unavailable"
      : "Click to book";

  button.innerHTML = `
    <div class="tag-name">${escapeHtml(item.car)}</div>
    <div class="tag-status ${statusClass}-text">
      <span class="led ${statusClass}"></span>
      ${statusText}
    </div>
    <span class="tag-action">${actionText}</span>
  `;

  if (!disabledUntilSearch && !item.booked) {
    button.addEventListener("click", () => bookAvailableCar(item.car));
  }

  tag.appendChild(button);
  return tag;
}

function bookAvailableCar(car) {
  if (!lastCheck) {
    showToast("Check availability before booking.", "error");
    return;
  }

  if (isCarBooked(car, lastCheck.start, lastCheck.end)) {
    showToast(`${car} is already booked during this period.`, "error");
    renderFleetStatus();
    return;
  }

  bookings[car].push([lastCheck.start, lastCheck.end]);
  saveState();
  renderAll();
  showToast(`Booked ${car} from ${formatDate(lastCheck.start)} to ${formatDate(lastCheck.end)}.`, "success");
}

function renderCarSelect() {
  removeCarSelect.innerHTML = "";

  if (!cars.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No cars available";
    removeCarSelect.appendChild(option);
    removeCarSelect.disabled = true;
    return;
  }

  removeCarSelect.disabled = false;
  cars.forEach((car) => {
    const option = document.createElement("option");
    option.value = car;
    option.textContent = car;
    removeCarSelect.appendChild(option);
  });
}

function getBookingRows() {
  return Object.keys(bookings)
    .sort()
    .flatMap((car) =>
      [...bookings[car]]
        .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
        .map(([start, end]) => ({ car, start, end }))
    );
}

function renderBookings() {
  const rows = getBookingRows();
  bookingList.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No bookings recorded yet.";
    bookingList.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const bookingRow = document.createElement("div");
    bookingRow.className = "booking-row";
    bookingRow.innerHTML = `
      <span>${escapeHtml(row.car)}</span>
      <span>${formatDate(row.start)}</span>
      <span>${formatDate(row.end)}</span>
    `;

    const removeButton = document.createElement("button");
    removeButton.className = "button button-danger row-remove";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeBooking(row.car, row.start, row.end));

    bookingRow.appendChild(removeButton);
    bookingList.appendChild(bookingRow);
  });
}

function removeBooking(car, startDate, endDate) {
  const ranges = bookings[car] || [];
  const index = ranges.findIndex(([start, end]) => start === startDate && end === endDate);

  if (index === -1) {
    showToast("Could not remove that booking. Refresh and try again.", "error");
    return;
  }

  ranges.splice(index, 1);
  saveState();
  renderAll();
  showToast(`Removed booking for ${car}.`, "success");
}

function addCar(name) {
  const cleanName = name.trim();
  const exists = cars.some((car) => car.toLowerCase() === cleanName.toLowerCase());

  if (!cleanName) {
    showToast("Enter a car name.", "error");
    return;
  }

  if (exists) {
    showToast(`${cleanName} already exists in the fleet.`, "error");
    return;
  }

  cars.push(cleanName);
  bookings[cleanName] = [];
  saveState();
  newCarNameInput.value = "";
  renderAll();
  showToast(`Added ${cleanName}.`, "success");
}

function removeCar(car) {
  if (!car || !cars.includes(car)) {
    showToast("Select a car to remove.", "error");
    return;
  }

  cars = cars.filter((item) => item !== car);
  delete bookings[car];
  saveState();
  renderAll();
  showToast(`Removed ${car}.`, "success");
}

function renderAll() {
  syncBookingsToCars();
  renderFleetStatus();
  renderCarSelect();
  renderBookings();
}

function showToast(message, type = "success") {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  toastTimer = window.setTimeout(() => {
    toast.className = "toast";
  }, 3200);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

availabilityForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const start = startDateInput.value;
  const end = endDateInput.value;
  if (!validateDateRange(start, end)) {
    return;
  }

  lastCheck = { start, end };
  renderFleetStatus();
});

addCarForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addCar(newCarNameInput.value);
});

removeCarForm.addEventListener("submit", (event) => {
  event.preventDefault();
  removeCar(removeCarSelect.value);
});

function initialize() {
  const today = todayIso();
  startDateInput.value = today;
  endDateInput.value = today;
  syncBookingsToCars();
  saveState();
  renderAll();
}

initialize();
