import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZYNpeWaySvGjudGow69fFUSclOY6cym8",
  authDomain: "dj-carhub.firebaseapp.com",
  projectId: "dj-carhub",
  storageBucket: "dj-carhub.firebasestorage.app",
  messagingSenderId: "110250312236",
  appId: "1:110250312236:web:a43365ad67a52cff3f0789",
};

const DEFAULT_CARS = [
  "Toyota Innova",
  "Hyundai Creta",
  "Honda City",
  "Mahindra Thar",
  "Kia Seltos",
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const carsCollection = collection(db, "cars");
const bookingsCollection = collection(db, "bookings");

let carDocs = [];
let bookingDocs = [];
let lastCheck = null;
let toastTimer = null;
let hasSeededDefaultCars = false;

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

function getCarNames() {
  return carDocs.map((car) => car.name);
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
  return bookingDocs.some(
    (booking) =>
      booking.car === car &&
      rangesOverlap(startDate, endDate, booking.start, booking.end)
  );
}

function getFleetStatus(startDate, endDate) {
  return getCarNames().map((car) => ({
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
    getCarNames().forEach((car) => {
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

async function hasBookingConflict(car, startDate, endDate) {
  const bookingQuery = query(bookingsCollection, where("car", "==", car));
  const snapshot = await getDocs(bookingQuery);

  return snapshot.docs.some((bookingDoc) => {
    const booking = bookingDoc.data();
    return rangesOverlap(startDate, endDate, booking.start, booking.end);
  });
}

async function bookAvailableCar(car) {
  if (!lastCheck) {
    showToast("Check availability before booking.", "error");
    return;
  }

  try {
    const conflictExists = await hasBookingConflict(car, lastCheck.start, lastCheck.end);
    if (conflictExists) {
      showToast(`${car} is already booked during this period.`, "error");
      renderFleetStatus();
      return;
    }

    await addDoc(bookingsCollection, {
      car,
      start: lastCheck.start,
      end: lastCheck.end,
    });

    showToast(
      `Booked ${car} from ${formatDate(lastCheck.start)} to ${formatDate(lastCheck.end)}.`,
      "success"
    );
  } catch (error) {
    console.error("Error booking car:", error);
    showToast("Could not save this booking. Check Firebase permissions.", "error");
  }
}

function renderCarSelect() {
  removeCarSelect.innerHTML = "";
  const cars = getCarNames();

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
  return [...bookingDocs].sort(
    (a, b) =>
      a.car.localeCompare(b.car) ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end)
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
    removeButton.addEventListener("click", () => removeBooking(row.id));

    bookingRow.appendChild(removeButton);
    bookingList.appendChild(bookingRow);
  });
}

async function removeBooking(bookingId) {
  try {
    await deleteDoc(doc(db, "bookings", bookingId));
    showToast("Removed booking.", "success");
  } catch (error) {
    console.error("Error removing booking:", error);
    showToast("Could not remove that booking. Check Firebase permissions.", "error");
  }
}

async function addCar(name) {
  const cleanName = name.trim();
  const existsInState = getCarNames().some(
    (car) => car.toLowerCase() === cleanName.toLowerCase()
  );

  if (!cleanName) {
    showToast("Enter a car name.", "error");
    return;
  }

  if (existsInState) {
    showToast(`${cleanName} already exists in the fleet.`, "error");
    return;
  }

  try {
    const duplicateQuery = query(carsCollection, where("name", "==", cleanName));
    const duplicateSnapshot = await getDocs(duplicateQuery);
    if (!duplicateSnapshot.empty) {
      showToast(`${cleanName} already exists in the fleet.`, "error");
      return;
    }

    await addDoc(carsCollection, { name: cleanName });
    newCarNameInput.value = "";
    showToast(`Added ${cleanName}.`, "success");
  } catch (error) {
    console.error("Error adding car:", error);
    showToast("Could not add this car. Check Firebase permissions.", "error");
  }
}

async function removeCar(car) {
  if (!car || !getCarNames().includes(car)) {
    showToast("Select a car to remove.", "error");
    return;
  }

  try {
    const batch = writeBatch(db);
    const matchingCars = carDocs.filter((carDoc) => carDoc.name === car);
    matchingCars.forEach((carDoc) => {
      batch.delete(doc(db, "cars", carDoc.id));
    });

    const relatedBookingsQuery = query(bookingsCollection, where("car", "==", car));
    const relatedBookings = await getDocs(relatedBookingsQuery);
    relatedBookings.forEach((bookingDoc) => {
      batch.delete(doc(db, "bookings", bookingDoc.id));
    });

    await batch.commit();
    showToast(`Removed ${car}.`, "success");
  } catch (error) {
    console.error("Error removing car:", error);
    showToast("Could not remove this car. Check Firebase permissions.", "error");
  }
}

function renderAll() {
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

async function seedDefaultCarsIfNeeded() {
  if (hasSeededDefaultCars || carDocs.length) {
    return;
  }

  hasSeededDefaultCars = true;

  try {
    const batch = writeBatch(db);
    DEFAULT_CARS.forEach((name) => {
      const carRef = doc(carsCollection);
      batch.set(carRef, { name });
    });
    await batch.commit();
  } catch (error) {
    console.error("Error seeding default cars:", error);
    showToast("Could not create default cars. Check Firebase permissions.", "error");
  }
}

function subscribeToCars() {
  onSnapshot(
    carsCollection,
    async (snapshot) => {
      carDocs = snapshot.docs
        .map((carDoc) => ({
          id: carDoc.id,
          name: String(carDoc.data().name || "").trim(),
        }))
        .filter((car) => car.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      await seedDefaultCarsIfNeeded();
      renderAll();
    },
    (error) => {
      console.error("Cars listener failed:", error);
      showToast("Could not load cars from Firebase.", "error");
    }
  );
}

function subscribeToBookings() {
  onSnapshot(
    bookingsCollection,
    (snapshot) => {
      bookingDocs = snapshot.docs
        .map((bookingDoc) => {
          const booking = bookingDoc.data();
          return {
            id: bookingDoc.id,
            car: String(booking.car || "").trim(),
            start: String(booking.start || "").trim(),
            end: String(booking.end || "").trim(),
          };
        })
        .filter(
          (booking) =>
            booking.car &&
            isIsoDate(booking.start) &&
            isIsoDate(booking.end) &&
            booking.start <= booking.end
        );

      renderAll();
    },
    (error) => {
      console.error("Bookings listener failed:", error);
      showToast("Could not load bookings from Firebase.", "error");
    }
  );
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
  renderAll();
  subscribeToCars();
  subscribeToBookings();
}

initialize();
