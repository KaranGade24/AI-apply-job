/**
 * JobMatchingService: Computes AI match scores, skill match checks, missing skills & concerns
 */

export class JobMatchingService {
  static computeMatch(userSkills = [], jobSkills = []) {
    const userSkillsSet = new Set(userSkills.map(s => s.toLowerCase().trim()));
    const matching = [];
    const missing = [];

    for (const skill of jobSkills) {
      if (userSkillsSet.has(skill.toLowerCase().trim())) {
        matching.push(skill);
      } else {
        missing.push(skill);
      }
    }

    const total = jobSkills.length || 1;
    const matchPercentage = Math.round((matching.length / total) * 100);

    return {
      matchPercentage: Math.max(matchPercentage, 60),
      matchingSkills: matching,
      missingSkills: missing,
      recommendation: matchPercentage >= 80 ? 'Highly Recommended' : 'Good Match',
    };
  }
}

export default JobMatchingService;
