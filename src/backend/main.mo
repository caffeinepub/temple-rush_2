import Runtime "mo:core/Runtime";

actor {
  var highScore = 0;

  public query ({ caller }) func getHighScore() : async Nat {
    highScore;
  };

  public shared ({ caller }) func submitScore(score : Nat) : async () {
    if (score <= highScore) { Runtime.trap("Score is not higher than the current high score. ") };
    highScore := score;
  };
};
