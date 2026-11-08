/* ResQnet phone GPS helper for the ESP32 captive portal.
 *
 * Browser geolocation is requested only after an explicit user action.
 * The helper never blocks or delays the report form's submit event.
 *
 * Form fields written by this helper:
 *   location_lat, location_lon, location_accuracy_m,
 *   location_captured_at, location_source
 */
(function () {
  "use strict";

  const FIELD_NAMES = {
    lat: "location_lat",
    lon: "location_lon",
    accuracy: "location_accuracy_m",
    capturedAt: "location_captured_at",
    source: "location_source",
  };

  function getOrCreateField(form, key) {
    const name = FIELD_NAMES[key];
    let field = form.querySelector('[name="' + name + '"]');
    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.setAttribute("data-resqnet-generated", "true");
      form.appendChild(field);
    }
    return field;
  }

  function getStatus(form) {
    return form.querySelector("[data-resqnet-location-status]");
  }

  function setStatus(form, message, state) {
    const status = getStatus(form);
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || "info";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
  }

  function setLocation(form, location) {
    getOrCreateField(form, "lat").value = String(location.latitude);
    getOrCreateField(form, "lon").value = String(location.longitude);
    getOrCreateField(form, "accuracy").value =
      location.accuracy_m == null ? "" : String(location.accuracy_m);
    getOrCreateField(form, "capturedAt").value = location.captured_at;
    getOrCreateField(form, "source").value = location.source;

    form.dataset.resqnetLocationAvailable = "true";
    form.dataset.resqnetLocationSource = location.source;
    form.dispatchEvent(
      new CustomEvent("resqnet:location-ready", { detail: location })
    );
  }

  function clearLocation(form) {
    Object.keys(FIELD_NAMES).forEach(function (key) {
      getOrCreateField(form, key).value = "";
    });
    form.dataset.resqnetLocationAvailable = "false";
    delete form.dataset.resqnetLocationSource;
  }

  function readManualLocation(form) {
    const latField = form.querySelector("[data-resqnet-manual-lat]");
    const lonField = form.querySelector("[data-resqnet-manual-lon]");
    if (!latField || !lonField) return null;

    const latText = String(latField.value || "").trim();
    const lonText = String(lonField.value || "").trim();
    if (!latText && !lonText) return null;

    const latitude = Number(latText);
    const longitude = Number(lonText);
    if (
      !latText ||
      !lonText ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setStatus(form, "Enter valid latitude and longitude, or submit without location.", "error");
      return { invalid: true };
    }

    return {
      latitude: latitude,
      longitude: longitude,
      accuracy_m: null,
      captured_at: new Date().toISOString(),
      source: "MANUAL",
    };
  }

  function capture(form, options) {
    const settings = options || {};
    const timeoutMs = Number(settings.timeoutMs) || 5000;
    clearLocation(form);

    if (!window.isSecureContext) {
      setStatus(
        form,
        "Automatic phone GPS is blocked on this HTTP captive portal. You can enter coordinates manually or send the SOS without location.",
        "unavailable"
      );
      return Promise.resolve(null);
    }

    if (!navigator.geolocation) {
      setStatus(
        form,
        "This browser does not provide location access. You can send the SOS without location.",
        "unavailable"
      );
      return Promise.resolve(null);
    }

    setStatus(form, "Requesting phone location…", "pending");

    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          const coords = position.coords;
          const location = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy_m: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
            captured_at: new Date(position.timestamp || Date.now()).toISOString(),
            source: "BROWSER_GNSS",
          };

          setLocation(form, location);
          const accuracy =
            location.accuracy_m == null
              ? ""
              : " (±" + Math.round(location.accuracy_m) + " m)";
          setStatus(form, "Phone location attached" + accuracy + ".", "success");
          resolve(location);
        },
        function (error) {
          let message = "Phone location is unavailable. The SOS can still be sent.";
          if (error && error.code === 1) {
            message = "Location permission was denied. The SOS can still be sent.";
          } else if (error && error.code === 2) {
            message = "The phone could not determine a location. The SOS can still be sent.";
          } else if (error && error.code === 3) {
            message = "Phone GPS timed out. The SOS can still be sent.";
          }
          setStatus(form, message, "unavailable");
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: timeoutMs,
        }
      );
    });
  }

  function attach(form) {
    if (!form || form.dataset.resqnetGpsAttached === "true") return;
    form.dataset.resqnetGpsAttached = "true";
    clearLocation(form);

    const button = form.querySelector("[data-resqnet-get-location]");
    if (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        capture(form);
      });
    }

    form.addEventListener("submit", function () {
      // If no browser fix was captured, accept manual coordinates when the
      // form exposes the optional manual fields. Do not prevent SOS submit.
      if (form.dataset.resqnetLocationAvailable === "true") return;
      const manual = readManualLocation(form);
      if (!manual || manual.invalid) return;
      setLocation(form, manual);
      setStatus(form, "Manual location attached.", "success");
    });
  }

  function attachAll() {
    document.querySelectorAll("[data-resqnet-report-form]").forEach(attach);
  }

  window.ResQnetPhoneGPS = {
    attach: attach,
    attachAll: attachAll,
    capture: capture,
    clear: clearLocation,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachAll);
  } else {
    attachAll();
  }
})();
