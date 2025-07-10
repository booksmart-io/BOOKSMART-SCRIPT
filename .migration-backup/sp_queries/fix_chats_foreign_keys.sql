-- Add foreign key constraints to chats table
-- This links sender_id and receiver_id to the users table (id column)

ALTER TABLE public.chats
ADD CONSTRAINT fk_chats_sender
FOREIGN KEY (sender_id)
REFERENCES public.users (id);

ALTER TABLE public.chats
ADD CONSTRAINT fk_chats_receiver
FOREIGN KEY (receiver_id)
REFERENCES public.users (id);
