import { useTranslation } from '../i18n';

type Step = 'cart' | 'email' | 'payment';

type CheckoutStepsProps = {
  currentStep: Step;
};

const steps: Step[] = ['cart', 'email', 'payment'];

function DesktopSteps({ currentStep }: CheckoutStepsProps) {
  const { t } = useTranslation();
  const currentIndex = steps.indexOf(currentStep);

  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step} className="flex items-center">
            {index > 0 && (
              <div className={`h-px w-8 sm:w-12 mx-2 ${isCompleted ? 'bg-[#0071e3]' : 'bg-[#d2d2d7]'}`} />
            )}
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isCompleted
                    ? 'bg-[#0071e3] text-white'
                    : isCurrent
                      ? 'border-2 border-[#0071e3] text-[#0071e3]'
                      : 'border-2 border-[#d2d2d7] text-[#86868b]'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-sm font-medium ${
                  isCurrent ? 'text-[#1d1d1f]' : isCompleted ? 'text-[#0071e3]' : 'text-[#86868b]'
                }`}
              >
                {t(`checkout.steps.${step}`)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MobileSteps({ currentStep }: CheckoutStepsProps) {
  const { t } = useTranslation();
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Step name */}
      <span className="text-sm font-semibold text-[#1d1d1f]">
        {t('checkout.stepOf', { current: String(currentIndex + 1), total: String(steps.length) })}
        {' — '}
        {t(`checkout.steps.${currentStep}`)}
      </span>

      {/* Dot indicators */}
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <span
              key={step}
              className={`rounded-full transition-all ${
                isCompleted
                  ? 'h-2.5 w-2.5 bg-[#0071e3]'
                  : isCurrent
                    ? 'h-3 w-3 bg-[#0071e3] ring-2 ring-[#0071e3]/30'
                    : 'h-2.5 w-2.5 bg-[#d2d2d7]'
              }`}
              aria-label={t(`checkout.steps.${step}`)}
              aria-current={isCurrent ? 'step' : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CheckoutSteps({ currentStep }: CheckoutStepsProps) {
  return (
    <nav aria-label="Checkout steps" className="mb-8">
      {/* Desktop: full step indicator */}
      <div className="hidden sm:block">
        <DesktopSteps currentStep={currentStep} />
      </div>

      {/* Mobile: compact dot indicator */}
      <div className="sm:hidden">
        <MobileSteps currentStep={currentStep} />
      </div>
    </nav>
  );
}
