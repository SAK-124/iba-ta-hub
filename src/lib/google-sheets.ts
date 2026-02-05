
const DEFAULT_GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby4L98xHkIIRBZt6SbAnNnpbibNhaGRpePc-35tFXso-fFhWGVXn7eGo9OEq9aqQeFkRg/exec";

export const GOOGLE_SCRIPT_URL =
  import.meta.env.VITE_GOOGLE_SCRIPT_URL || DEFAULT_GOOGLE_SCRIPT_URL;

export type GoogleSheetPayload = Record<string, unknown>;

export const saveToGoogleSheet = async (data: GoogleSheetPayload) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      // Using text/plain avoids browser pre-flight complexity with Apps Script web apps.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error saving to Google Sheet:", error);
    return false;
  }
};
