-- Add naming_penalty column to attendance table
ALTER TABLE public.attendance 
ADD COLUMN naming_penalty boolean NOT NULL DEFAULT false;
