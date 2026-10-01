import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

export const QuestionsPanel = ({ questions = [], answers = {}, onAnswerChange, onSubmitAnswers, loading }) => {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <h3 className="text-amber-900 font-semibold mb-2">Pending Questionnaire Questions</h3>
      <p className="text-amber-700 text-sm mb-3">Please answer the following questions required by the application portal:</p>
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.questionId || idx} className="bg-white p-3 rounded border border-amber-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">{q.question || q.questionId}</label>
            <Input
              value={answers[q.questionId] || ''}
              onChange={(e) => onAnswerChange(q.questionId, e.target.value)}
              placeholder="Type your answer..."
            />
          </div>
        ))}
        <Button onClick={onSubmitAnswers} isLoading={loading} variant="primary">
          Submit Answers & Resume
        </Button>
      </div>
    </div>
  );
};
