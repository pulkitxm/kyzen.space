import Image from "next/image";

export default function CardsPage() {
  return (
    <div className="grid grid-cols-13">
      {["hearts", "diamonds", "spades", "clubs"].map((i) =>
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((j) => (
          <Image
            src={`/games/playing-cards/${i}/${j}.svg`}
            width={200}
            height={200}
            alt={`${i}-${j}`}
          />
        )),
      )}
    </div>
  );
}
