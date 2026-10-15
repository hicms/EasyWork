import type { Context } from '@deepseek-ai/cordis';
import type { LocaleFace } from '@deepseek-ai/dsh-client-ui-slots';
import { HeroBrandMark, productName } from '../components/Brand.js';

const keys = {
  conversation: ['hero.headline'],
  chat: ['chat.deepDiving', 'chat.deepDivingFor', 'message.stepProcess.thinking', 'message.stepProcess.done.thinking'],
} as const;
type BrandingKey = typeof keys[keyof typeof keys][number];

const dictionaries: Record<'zh' | 'en', Record<BrandingKey, string>> = {
  zh: {
    'hero.headline': productName,
    'chat.deepDiving': '正在思考…',
    'chat.deepDivingFor': '正在思考，已用时 {duration}…',
    'message.stepProcess.thinking': '正在思考…',
    'message.stepProcess.done.thinking': '思考完成',
  },
  en: {
    'hero.headline': productName,
    'chat.deepDiving': 'Thinking…',
    'chat.deepDivingFor': 'Thinking for {duration}…',
    'message.stepProcess.thinking': 'Thinking…',
    'message.stepProcess.done.thinking': 'Thinking complete',
  },
};

/** The public locale face plus the dictionary registration used by this Profile. */
type BrandingLocale = LocaleFace & {
  register(namespace: string, dictionaries: Record<'zh' | 'en', Record<BrandingKey, string>>): () => void;
};

export function installBranding(ctx: Context): void {
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -10,
  }, HeroBrandMark));
  ctx.inject(['locale'], scope => {
    const locale = scope.get('locale') as BrandingLocale;
    scope.effect(() => {
      const unregister = locale.register('easywork.branding', dictionaries);
      const originalBind = locale.bind;
      const copy = originalBind.call(locale, 'easywork.branding');
      const bound = new Map<string, ReturnType<LocaleFace['bind']>>();
      const namespaces = new Map<string, ReadonlySet<string>>(Object.entries(keys).map(([namespace, names]) => [namespace, new Set(names)]));
      let active = true;

      // The locked locale API has no override layer. Decorate its public binder
      // so native presenters keep their own components, dictionaries and state.
      const bind: LocaleFace['bind'] = namespace => {
        const names = namespaces.get(namespace);
        if (!names) return originalBind.call(locale, namespace);
        let translate = bound.get(namespace);
        if (!translate) {
          const upstream = originalBind.call(locale, namespace);
          translate = (key, params) => active && names.has(key) ? copy(key, params) : upstream(key, params);
          bound.set(namespace, translate);
        }
        return translate;
      };
      locale.bind = bind;
      return () => {
        active = false;
        if (locale.bind === bind) locale.bind = originalBind;
        unregister();
      };
    }, 'easywork.branding');
  });
}
