-- Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "Users read their own roles" ON public.user_roles;
CREATE POLICY "Users read their own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Usage telemetry columns
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS task_type text,
  ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS usage_events_created_at_idx ON public.usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON public.usage_events (user_id, created_at DESC);

DROP POLICY IF EXISTS "Admins read all usage" ON public.usage_events;
CREATE POLICY "Admins read all usage" ON public.usage_events
FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Provider configuration (no credentials stored here)
CREATE TABLE IF NOT EXISTS public.ai_provider_config (
  provider text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  tasks text[] NOT NULL DEFAULT '{}',
  models jsonb NOT NULL DEFAULT '{}'::jsonb,
  daily_request_cap integer,
  monthly_request_cap integer,
  paid boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_provider_config TO authenticated;
GRANT ALL ON public.ai_provider_config TO service_role;
ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone signed in can read provider config" ON public.ai_provider_config;
CREATE POLICY "Anyone signed in can read provider config" ON public.ai_provider_config
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage provider config" ON public.ai_provider_config;
CREATE POLICY "Admins manage provider config" ON public.ai_provider_config
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Global settings (limits, kill switches)
CREATE TABLE IF NOT EXISTS public.ai_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed in can read settings" ON public.ai_settings;
CREATE POLICY "Signed in can read settings" ON public.ai_settings
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage settings" ON public.ai_settings;
CREATE POLICY "Admins manage settings" ON public.ai_settings
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.ai_settings (key, value) VALUES
  ('MAX_DAILY_REQUESTS', '20000'::jsonb),
  ('MAX_MONTHLY_REQUESTS', '400000'::jsonb),
  ('MAX_DAILY_COST', '5'::jsonb),
  ('MAX_MONTHLY_COST', '50'::jsonb),
  ('MAX_USER_REQUESTS_PER_MINUTE', '12'::jsonb),
  ('MAX_USER_REQUESTS_PER_DAY', '400'::jsonb),
  ('PAID_BILLING_ENABLED', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ai_provider_config (provider, label, enabled, priority, tasks, models, paid) VALUES
  ('gemini','Gemini',true,10,'{multimodal,vision,document,video,reasoning,general,coding,math,translation}','{"general":"gemini-2.5-flash","multimodal":"gemini-2.5-flash","reasoning":"gemini-2.5-pro","coding":"gemini-2.5-flash","math":"gemini-2.5-pro"}'::jsonb,false),
  ('groq','Groq',true,20,'{general,coding,math,translation,reasoning}','{"general":"llama-3.3-70b-versatile","coding":"llama-3.3-70b-versatile","reasoning":"llama-3.3-70b-versatile"}'::jsonb,false),
  ('mistral','Mistral',true,30,'{general,coding,document,reasoning,translation}','{"general":"mistral-small-latest","coding":"codestral-latest","reasoning":"mistral-large-latest"}'::jsonb,false),
  ('cerebras','Cerebras',true,40,'{general,coding,math}','{"general":"llama-3.3-70b","coding":"llama-3.3-70b"}'::jsonb,false),
  ('openrouter','OpenRouter',true,50,'{general,coding,reasoning,math,translation,multimodal,vision}','{"general":"meta-llama/llama-3.3-70b-instruct:free","reasoning":"deepseek/deepseek-r1:free"}'::jsonb,false),
  ('cloudflare','Cloudflare Workers AI',true,60,'{general,coding}','{"general":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"}'::jsonb,false),
  ('huggingface','Hugging Face',true,70,'{general,coding,reasoning}','{"general":"meta-llama/Llama-3.3-70B-Instruct"}'::jsonb,false),
  ('cohere','Cohere',true,80,'{general,translation,document}','{"general":"command-r-plus-08-2024"}'::jsonb,false),
  ('lovable','Priyanshu Cloud AI',true,5,'{general,multimodal,vision,document,video,reasoning,coding,math,translation}','{"general":"google/gemini-3.7-flash","reasoning":"google/gemini-3.1-pro-preview","multimodal":"google/gemini-3.7-flash"}'::jsonb,false)
ON CONFLICT (provider) DO NOTHING;