export interface NtfyNotifyInput {
  title: string;
  message: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
  topic?: string;
}

const DEFAULT_NTFY_BASE_URL = 'https://ntfy.sh';
const DEFAULT_NTFY_TOPIC = 'AAMDportal';
const NOTIFICATION_TIMEOUT_MS = 4000;

const getBaseUrl = () =>
  (import.meta.env.VITE_NTFY_BASE_URL || DEFAULT_NTFY_BASE_URL).trim().replace(/\/+$/, '');

const getDefaultTopic = () => (import.meta.env.VITE_NTFY_TOPIC || DEFAULT_NTFY_TOPIC).trim();

export const sendNtfyNotification = async (input: NtfyNotifyInput): Promise<boolean> => {
  const topic = (input.topic || getDefaultTopic()).trim();
  const title = input.title.trim();
  const message = input.message.trim();

  if (!topic || !title || !message) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain;charset=utf-8',
      Title: title,
      Priority: String(input.priority ?? 3),
    };

    if (input.tags && input.tags.length > 0) {
      headers.Tags = input.tags.join(',');
    }

    const response = await fetch(`${getBaseUrl()}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers,
      body: message,
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};
