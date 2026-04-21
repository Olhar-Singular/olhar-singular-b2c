export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSession = {
  id: string;
  user_id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
};
