
export const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxj3q1xomykdIlJNWlgdRgsGL1DOwAVGWwf7pUFb42cPP69kZEBu4nrBjiNXIHLcnFY/exec";

export interface SheetPayload {
    name: string;
    email: string;
}

export const saveToGoogleSheet = async (data: SheetPayload) => {
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            // IMPORTANT: We use 'text/plain' to avoid CORS pre-flight checks
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(data), // We still send JSON, just labeled as text
        });
        return true;
    } catch (error) {
        console.error("Error saving to Google Sheet:", error);
        return false;
    }
};
