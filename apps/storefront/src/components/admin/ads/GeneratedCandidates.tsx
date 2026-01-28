import { type FC } from 'react';
import type { AdCandidate } from '../../../types/ads';
import { CharCount } from './CharCount';

interface GeneratedCandidatesProps {
  candidates: AdCandidate[];
  language: 'ja' | 'en';
  onSelect: (candidate: AdCandidate) => void;
}

export const GeneratedCandidates: FC<GeneratedCandidatesProps> = ({
  candidates,
  language,
  onSelect,
}) => {
  const limits = language === 'ja'
    ? { headline: 15, description: 45 }
    : { headline: 30, description: 90 };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#1d1d1f]">AI Generated Candidates</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {candidates.map((candidate, index) => (
          <div
            key={index}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">
                Variation {index + 1}
              </span>
            </div>

            {/* Headlines */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Headlines ({candidate.headlines.length})
              </h4>
              <div className="space-y-2">
                {candidate.headlines.slice(0, 5).map((headline, hIndex) => (
                  <div key={hIndex} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-800 flex-1">{headline}</span>
                      <CharCount
                        text={headline}
                        limit={limits.headline}
                      />
                    </div>
                  </div>
                ))}
                {candidate.headlines.length > 5 && (
                  <p className="text-xs text-gray-500">
                    +{candidate.headlines.length - 5} more headlines...
                  </p>
                )}
              </div>
            </div>

            {/* Descriptions */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Descriptions ({candidate.descriptions.length})
              </h4>
              <div className="space-y-2">
                {candidate.descriptions.map((description, dIndex) => (
                  <div key={dIndex} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-600 flex-1">{description}</span>
                      <CharCount
                        text={description}
                        limit={limits.description}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Keywords */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Suggested Keywords
              </h4>
              <div className="flex flex-wrap gap-1">
                {candidate.suggestedKeywords.slice(0, 5).map((keyword, kIndex) => (
                  <span
                    key={kIndex}
                    className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            {/* Use This Button */}
            <button
              type="button"
              onClick={() => onSelect(candidate)}
              className="w-full mt-2 px-4 py-2 bg-[#0071e3] text-white rounded-lg text-sm font-medium hover:bg-[#0077ed] transition-colors"
            >
              Use This Candidate
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
