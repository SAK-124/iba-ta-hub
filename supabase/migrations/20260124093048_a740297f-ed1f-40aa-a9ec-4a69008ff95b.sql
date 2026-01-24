-- App Settings (single row for global settings)
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_verification_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- TA Allowlist table
CREATE TABLE public.ta_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Students Roster table
CREATE TABLE public.students_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_no text NOT NULL,
  student_name text NOT NULL,
  erp text UNIQUE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Sessions table
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number integer UNIQUE NOT NULL,
  session_date date NOT NULL,
  day_of_week text NOT NULL CHECK (day_of_week IN ('Friday', 'Saturday')),
  end_time time,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Attendance table
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  erp text NOT NULL REFERENCES public.students_roster(erp) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(session_id, erp)
);

-- Submissions List table
CREATE TABLE public.submissions_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Penalty Types table
CREATE TABLE public.penalty_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  time_window_hours integer NOT NULL DEFAULT 24,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tickets table
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by_email text NOT NULL,
  entered_erp text NOT NULL,
  roster_name text,
  roster_class_no text,
  group_type text NOT NULL CHECK (group_type IN ('class_issue', 'grading_query', 'penalty_query', 'absence_query')),
  category text NOT NULL,
  subcategory text,
  details_text text,
  details_json jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_attendance_session ON public.attendance(session_id);
CREATE INDEX idx_attendance_erp ON public.attendance(erp);
CREATE INDEX idx_tickets_erp ON public.tickets(entered_erp);
CREATE INDEX idx_tickets_status ON public.tickets(status);

-- Insert initial app settings row
INSERT INTO public.app_settings (id, roster_verification_enabled) 
VALUES ('00000000-0000-0000-0000-000000000001', true);

-- Insert initial penalty type
INSERT INTO public.penalty_types (label, active, time_window_hours)
VALUES ('Naming penalty', true, 24);

-- Insert placeholder TA emails
INSERT INTO public.ta_allowlist (email, active) VALUES 
('TA_EMAIL_1@example.com', true),
('TA_EMAIL_2@example.com', true);

-- Enable RLS on all tables
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ta_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalty_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is TA
CREATE OR REPLACE FUNCTION public.is_ta(user_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ta_allowlist
    WHERE email = user_email AND active = true
  )
$$;

-- Security definer function to check roster
CREATE OR REPLACE FUNCTION public.check_roster(check_erp text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'found', true,
    'student_name', student_name,
    'class_no', class_no
  ) INTO result
  FROM public.students_roster
  WHERE erp = check_erp;
  
  IF result IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  
  RETURN result;
END;
$$;

-- RLS Policies for app_settings
CREATE POLICY "Anyone can read app settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "TAs can update app settings"
  ON public.app_settings FOR UPDATE
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for ta_allowlist
CREATE POLICY "TAs can view allowlist"
  ON public.ta_allowlist FOR SELECT
  USING (public.is_ta(auth.jwt() ->> 'email'));

CREATE POLICY "TAs can manage allowlist"
  ON public.ta_allowlist FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for students_roster (only TAs can access directly)
CREATE POLICY "TAs can manage roster"
  ON public.students_roster FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for sessions
CREATE POLICY "Anyone can read sessions"
  ON public.sessions FOR SELECT
  USING (true);

CREATE POLICY "TAs can manage sessions"
  ON public.sessions FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for attendance (TAs manage, students read their own via edge function)
CREATE POLICY "TAs can manage attendance"
  ON public.attendance FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for submissions_list
CREATE POLICY "Anyone can read submissions list"
  ON public.submissions_list FOR SELECT
  USING (true);

CREATE POLICY "TAs can manage submissions list"
  ON public.submissions_list FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for penalty_types
CREATE POLICY "Anyone can read penalty types"
  ON public.penalty_types FOR SELECT
  USING (true);

CREATE POLICY "TAs can manage penalty types"
  ON public.penalty_types FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- RLS Policies for tickets
CREATE POLICY "TAs can view all tickets"
  ON public.tickets FOR SELECT
  USING (public.is_ta(auth.jwt() ->> 'email'));

CREATE POLICY "Authenticated users can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "TAs can update tickets"
  ON public.tickets FOR UPDATE
  USING (public.is_ta(auth.jwt() ->> 'email'));

-- Enable realtime for tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();