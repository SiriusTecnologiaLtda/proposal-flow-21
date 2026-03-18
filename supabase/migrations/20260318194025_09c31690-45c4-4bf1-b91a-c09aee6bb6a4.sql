
ALTER TABLE public.profiles 
ADD COLUMN gmail_refresh_token text DEFAULT NULL,
ADD COLUMN gmail_sender_email text DEFAULT NULL;
