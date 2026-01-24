-- Add response column to tickets
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS ta_response text;

-- Create rule_exceptions table
CREATE TABLE IF NOT EXISTS public.rule_exceptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    erp text NOT NULL,
    student_name text,
    class_no text,
    issue_type text, -- e.g., 'camera_excused', 'connectivity'
    assigned_day text, -- 'friday', 'saturday', 'both'
    notes text,
    active boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE public.rule_exceptions ENABLE ROW LEVEL SECURITY;

-- Policies for rule_exceptions
-- TAs (checked by email allowlist) can do everything
CREATE POLICY "TAs can view rule exceptions" ON public.rule_exceptions
    FOR SELECT
    USING (public.is_ta(auth.jwt() ->> 'email'));

CREATE POLICY "TAs can insert rule exceptions" ON public.rule_exceptions
    FOR INSERT
    WITH CHECK (public.is_ta(auth.jwt() ->> 'email'));

CREATE POLICY "TAs can update rule exceptions" ON public.rule_exceptions
    FOR UPDATE
    USING (public.is_ta(auth.jwt() ->> 'email'));

CREATE POLICY "TAs can delete rule exceptions" ON public.rule_exceptions
    FOR DELETE
    USING (public.is_ta(auth.jwt() ->> 'email'));
